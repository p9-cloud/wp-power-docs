# 實作計劃：SortablePosts 章節拖拽排序持久化失效修復

> **範圍模式**：HOLD SCOPE（Bug 修復，範圍已由 Feature + Issue 鎖定）
> **預估影響檔案**：3–8 個（依 Phase 0 SQL 驗證結果決定修復層級）
> **規劃依據**：`specs/open-issue/bug-sortable-posts-menu-order-not-persisted.md`、
> `specs/features/sortable-posts/知識庫章節拖拽排序.feature`、
> `specs/clarify/2026-04-20-1731.md`

---

## 概述

知識庫管理後台的「章節管理」分頁（`#/docs/edit/:id`）在管理員拖拽 `pd_doc` 章節後，
前端對 Powerhouse 共用層 `POST /v2/powerhouse/posts/sort` 呼叫成功（HTTP 200），
但 `wp_posts.menu_order` / `post_parent` 疑似未被正確持久化，
或寫入成功但前端重新載入後樹狀結構仍為舊值。

本計劃採 **「先 SQL 驗證、後分支修復」** 策略：Phase 0 強制以 SQL 確認資料庫寫入狀態，
再依根因層級進入 Phase 1-A（前端）／1-B（快取）／1-C（Powerhouse 寫入邏輯）三種分支，
並於 Phase 2 執行跨 plugin 迴歸測試、Phase 3 處理前台 transient 快取連動。

---

## 需求重述

1. **Scope**：只處理 `pd_doc` CPT 在 SortablePosts 拖拽排序後的持久化失效。
   不觸及 SortablePosts 以外的其他管理功能、不觸及 `power-course` 章節排序行為
   （但需被視為迴歸測試對象）。
2. **兩個必驗情境**（Feature Rule 2 的 Examples）：
   - **同層級重排**：章節一（`menu_order=0`）拖至章節三之後；期望三個章節的 `menu_order`
     依序變為 `{101:2, 102:0, 103:1}`，三個節點的 `post_modified` 皆更新。
   - **跨層級移動**：單元 2-1（`post_parent=102, menu_order=0`）拖至章節一之下第 3 位；
     期望 `{203: post_parent=101, menu_order=2}`，`post_modified` 更新。
3. **三欄位斷言**：`menu_order` + `post_parent` + `post_modified`
   （`post_modified` 作為「真的 UPDATE 發生」的鐵證，用於排除「查到舊資料」的假陽性）。
4. **根因層級未定，三條分支擇一執行**：
   - Layer A（前端 state / invalidate）
   - Layer B1（Powerhouse cache flush 對 Redis 無效）
   - Layer B2（Powerhouse SQL UPDATE 本身有 bug）

---

## 已知風險（來自研究）

| # | 風險 | 來源 | 緩解 |
|---|------|------|------|
| R1 | **Powerhouse 是 `j7-dev/wp-powerhouse` 共用層**，被 `power-docs`、`power-course`、`power-shop` 等多個外掛消費。修改 `CRUD::sort_posts` 會橫向影響 `power-course` 章節排序、其他外掛的文章排序 | 專案 plugins 目錄觀察到 `power-course` / `power-shop` 等 sibling 外掛 | 強制在 Phase 2 對 `power-course` SortableChapters 執行 E2E 迴歸；若必須改 Powerhouse，先在 Powerhouse 開 PR，`power-docs` 先用 local override / unload 原 callback 作為 hot-fix |
| R2 | **Redis Object Cache 環境下 `wp_cache_flush_group('posts')` 可能無效**。Powerhouse 的 `sort_posts` 只呼叫 `wp_cache_flush_group('posts')`，沒有對每筆 post 呼叫 `clean_post_cache()` | `powerhouse/inc/classes/Domains/Post/Utils/CRUD.php:259-263` 只用 flush_group | 測試 local（預設 `WP_Object_Cache`）+ 明確列出 Redis 驗證為 Phase 2 必要項；在 1-B 分支補 `clean_post_cache()` per-ID |
| R3 | **批次 SQL UPDATE 繞過 `save_post_pd_doc` hook**。Powerhouse 的 `sort_posts` 用 `$wpdb->query("UPDATE wp_posts SET ...")`，不經 `wp_update_post`；因此 `J7\PowerDocs\Domains\Doc\CPT::delete_transient()` 不會被觸發 → 前台 `power_docs_get_children_posts_html_{id}` transient 永久陳舊 | `powerhouse/inc/classes/Domains/Post/Utils/CRUD.php:236-254` 純 $wpdb SQL；`power-docs/inc/classes/Domains/Doc/CPT.php:23,124` 只掛 `save_post_pd_doc` | Phase 3 在 power-docs 端掛 `powerhouse/posts/sort/after`（若有）或以 REST `rest_after_insert_post` / 主動 hook 監聽 sort endpoint 完成事件清 transient；若無 hook，新增 Powerhouse filter 或改用 wrapper 路徑 |
| R4 | **`menu_order * 10` 差異**。`power-course` 的 `sort_chapters` 把 `menu_order * 10`（留空隙給未來插入），Powerhouse `sort_posts` 沒乘。若既有 `pd_doc` DB 資料已有 * 10 數據（誤用過 sort_chapters 相近邏輯），改動需遷移 | `power-course/.../Chapter/Utils/Utils.php:221` vs `powerhouse/.../Post/Utils/CRUD.php:222` | Phase 0 SQL probe 同時 SELECT 現有 `menu_order` 分佈；若皆為 0/1/2/... 連續，無需乘 10；若已為 0/10/20/...，需評估是否保留該慣例 |
| R5 | **Transaction exception 變成 HTTP 500 而非結構化 `WP_Error`**。`CRUD.php:252,268` 拋 `\Exception`，不回 `\WP_Error` | `powerhouse/inc/classes/Domains/Post/Utils/CRUD.php:195-269` | Phase 1-C 修 Powerhouse 時把 throw 改為 return `\WP_Error`，前端 `onError` 才能拿到具體訊息 |
| R6 | **`from_tree` 在後端用途不明**。Powerhouse 只用它來算 `$delete_ids`（誤把「移除的節點」當作要 trash 的節點）。**若前端誤送 `from_tree ≠ to_tree`，可能誤刪節點！** | `powerhouse/inc/classes/Domains/Post/Utils/CRUD.php:271-282` | Phase 0 SQL probe 同時驗 `post_status`（是否有節點被誤 trash）；若有，加入 Phase 1-C：限制「from 有但 to 沒有」僅限於 `post_parent` 指向 root doc 的節點，或要求前端明確送 `delete_ids` 參數 |
| R7 | **前端 `isEqual(from_tree, to_tree)` 誤判跳過 POST**。`treeToParams` 產出物含 `depth`、`menu_order`，若任一字段在 `from_tree` 與 `to_tree` 意外相同但樹結構實際有變，會 skip | `js/src/pages/admin/Docs/Edit/tabs/SortablePosts/index.tsx:86-88`；`utils/index.tsx:60-84` | Phase 0 首步驟加入 `console.log(from_tree, to_tree)` 驗證前端 payload |
| R8 | **`setTreeData` 在 `onTreeDataChange` 是 optimistic update，`invalidate` 在 `onSettled` 才觸發 refetch**。前端 local state 與 server state 之間存在時間差，若 refetch 回傳舊值（R2/R3 的後果），會被舊值覆寫 | SortablePosts `index.tsx:57-81, 117-122` | Phase 1-A 若為主因：將 refetch 成功與否作為 state 最終來源，或改採 `optimistic update + rollback on error` |
| R9 | **Powerhouse 是 git submodule / composer vendor，非本 repo 直接 checkout**。修改需透過 Powerhouse 專案發版再 `composer update` | 目錄 `wp-content/plugins/powerhouse/` 為獨立外掛 | Phase 1-C 採 worktree 策略：在 Powerhouse repo 開 PR；power-docs 端先以 local override（`remove_action`/`remove_filter` + 自家 callback）作為臨時修補 |

---

## 架構變更（條件式，依 Phase 0 結果）

| 分支 | 必要變更檔案 | 行號 / 位置 |
|------|--------------|------------|
| **1-A 前端** | `js/src/pages/admin/Docs/Edit/tabs/SortablePosts/index.tsx` | L83-125（`handleSave`）、L57-81（useEffect 重建 tree） |
| **1-A 前端** | `js/src/pages/admin/Docs/Edit/tabs/SortablePosts/utils/index.tsx` | L50-88（`treeToParams`） |
| **1-A 前端** | `js/src/pages/admin/Docs/Edit/tabs/SortablePosts/hooks/index.tsx` | L9-28（`usePostsList` 的 `queryMeta` / cache key） |
| **1-B 快取** | `powerhouse/inc/classes/Domains/Post/Utils/CRUD.php` | L258-264（補 `clean_post_cache()` per ID） |
| **1-B 快取（local override）** | `inc/classes/Domains/Doc/SortOverride.php`（新） | 監聽 `rest_post_dispatch` 當 route = `/v2/powerhouse/posts/sort` 時額外 `clean_post_cache` + `delete_transient` |
| **1-C 寫入邏輯** | `powerhouse/inc/classes/Domains/Post/Utils/CRUD.php` | L195-285（`sort_posts` 整個方法） |
| **1-C local override** | `inc/classes/Domains/Doc/SortOverride.php`（新） | `remove_filter('rest_prepare_...')` 不適用，改以替換 endpoint callback：`rest_api_init` priority 11 用 `unregister_route` + `register_route` |
| **Phase 3 transient** | `inc/classes/Domains/Doc/CPT.php` 或新 `inc/classes/Domains/Doc/SortHook.php` | 新掛鉤：於 `/posts/sort` 成功後以 REST filter 清 `power_docs_get_children_posts_html_{top_parent_id}` |

---

## 資料流分析

### 流程 1：前端拖拽 → API → DB → GET refetch（happy path）

```
[拖拽結束]
    │
    ▼
onTreeDataChange(data)  ──▶  setTreeData(data)  ──▶  handleSave(data)
    │                                                        │
    │                                                        ▼
    │                                         treeToParams(originTree) = from_tree
    │                                         treeToParams(data)        = to_tree
    │                                                        │
    │                                                        ▼
    │                                              isEqual(from, to)?
    │                                           ┌────────┴────────┐
    │                                      [是] skip            [否] POST
    │                                                                 │
    ▼                                                                 ▼
[UI 已反映新順序]                              POST /v2/powerhouse/posts/sort
                                                { from_tree, to_tree }
                                                                      │
                                                                      ▼
                                            CRUD::sort_posts($body_params)
                                                    │
                                                    ▼
                                   $wpdb->query('START TRANSACTION')
                                                    │
                                                    ▼
                                   foreach batch: CASE WHEN UPDATE wp_posts
                                                    │
                                                    ▼
                                          $wpdb->query('COMMIT')
                                                    │
                                                    ▼
                                   wp_cache_flush_group('posts')  ← R2 Redis 疑慮
                                   wp_cache_flush_group('post_meta')
                                                    │
                                                    ▼
                                   wp_trash_post(delete_ids)    ← R6 誤刪疑慮
                                                    │
                                                    ▼
                                   HTTP 200 { code: sort_success }
                                                    │
                                                    ▼
                                   onSettled: invalidate({ resource: 'posts', invalidates: ['list'] })
                                                    │
                                                    ▼
                                   useList refetch → GET /v2/powerhouse/posts
                                                    │
                                                    ▼
                                   WP_Query → get_children(post_parent)  ← 可能讀 object cache
                                                    │
                                                    ▼
                                   usePostsList 回傳 posts
                                                    │
                                                    ▼
                                   useEffect([isListFetching]) → setTreeData(restoredTree)
                                                    │
                                                    ▼
                                   [UI 最終狀態]
```

### Shadow paths（每階段的失敗模式）

```
前端 handleSave                          後端 sort_posts                        後端 GET /posts
    │                                         │                                      │
    ▼                                         ▼                                      ▼
[nil originTree?]                     [empty to_tree?]                        [object cache stale?]
  → handleSave 仍送？                  → UPDATE ... WHERE ID IN ()             → 回舊資料（R2）
[isEqual 誤判?]                        → SQL error: syntax                     → 前端覆寫 optimistic
  → skip POST（R7）                   [batch 中部分失敗?]                      → UI 回到舊狀態（R8）
[invalidate 時 refetch]               → transaction rollback OK
  在 POST 完成前觸發？                 → 但 $delete_ids 已在 COMMIT 後跑
  → race condition（R8）                 wp_trash_post（R6）
                                       [Redis cache flush 未生效?]
                                        → GET 回舊值（R2）
```

---

## 錯誤處理登記表

| 方法/路徑 | 可能失敗原因 | 錯誤類型 | 處理方式 | 使用者可見? |
|-----------|--------------|----------|----------|------------|
| `handleSave` → `isEqual` 誤判 | `treeToParams` 含 transient 欄位（`name`）值相同 | logic error | 修正 `treeToParams` 只保留 `{id, depth, menu_order, parent_id}`，移除 `name` | 靜默 → **CRITICAL GAP 候選** |
| `mutate` → `onError` | HTTP 500（Powerhouse 拋 Exception） | network / server | `message.loading({ content: '排序儲存失敗' })`（目前用 loading 而非 error，**可能是 bug**） | 使用者看到 loading 不消失 |
| `mutate` → `onSettled` `invalidate` | refetch 拿到 stale cache | data consistency | 無（信任 cache）→ 需補 `refetchOnWindowFocus` 或主動 `refetch()` | 使用者看到舊樹 |
| `CRUD::sort_posts` → `$wpdb->query UPDATE` | SQL 語法錯誤 / deadlock | DB error | try/catch → throw `\Exception` | **回傳 HTTP 500 而非 WP_Error（R5）** |
| `CRUD::sort_posts` → `wp_cache_flush_group` | Redis adapter 實作不完整 | cache inconsistency | 無（假設 flush 生效） | 靜默 → 前端 refetch 拿舊資料 |
| `CRUD::sort_posts` → `wp_trash_post(delete_ids)` | `from_tree` 誤包含 `to_tree` 沒有的 ID | data loss | **無驗證** → 直接 trash | **嚴重：使用者看到章節消失（R6）** |
| `save_post_pd_doc::delete_transient` | 批次 UPDATE 不觸發 save_post | cache inconsistency | 無 | 靜默 → 前台舊側邊欄（R3） |

---

## 失敗模式登記表

| 程式碼路徑 | 失敗模式 | 已處理? | 有測試? | 使用者可見? | 恢復路徑 |
|-----------|----------|---------|---------|------------|---------|
| `handleSave` L83-88 | `isEqual` 比對誤判跳過 POST | 否 | 否 | 靜默 | Phase 1-A：改用只比 `{id, menu_order, parent_id}` |
| `handleSave` L111-116 | `onError` 用 `message.loading` 不會自動關閉 | 否 | 否 | loading 卡住 | Phase 1-A：改為 `message.error` |
| `CRUD::sort_posts` L265-269 | exception 轉 500 無法在前端顯示 | 部分（catch 了但 re-throw） | 否 | HTTP 500 | Phase 1-C：return `new \WP_Error(...)` |
| `CRUD::sort_posts` L258-263 | Redis cache flush 失敗 | 否 | 否 | 靜默（refetch stale） | Phase 1-B：per-ID `clean_post_cache()` |
| `CRUD::sort_posts` L271-282 | `delete_ids` 誤判（from 有、to 沒有 = 想刪？） | 否 | 否 | 節點消失 | Phase 1-C：改為「只在前端顯式送 `delete_ids` 時才 trash」；或用 `post_parent` 防呆 |
| `save_post_pd_doc` hook | 批次 UPDATE 不觸發 | 否 | 否 | 前台側邊欄陳舊 | Phase 3：新 hook 或 REST 後處理 |
| `usePostsList` L12-25 | useList 的 stale-while-revalidate 在 optimistic UI 後覆寫回舊值 | 否 | 否 | UI 來回閃 | Phase 1-A：關 `refetchOnMount` 或 `keepPreviousData` 調整 |

---

## 實作步驟

### Phase 0 — SQL Probe（根因確認，**必做第一步**）

**目的**：在寫任何修復程式碼之前，以真實 SQL 查詢確認資料庫寫入狀態，避免盲目修錯層。

#### 步驟

1. **[Probe-0] 建立測試資料**（檔案：`tests/Integration/SortPostsProbeTest.php`，新）
   - 行動：建立一筆符合 Feature Background 的知識庫樹（1 root + 3 章節 + 3 單元）。
     沿用 `tests/Integration/TestCase.php` 的 `create_doc` / `create_nested_doc` helpers。
     以 `$this->factory()->post->create([ 'menu_order' => 0/1/2 ])` 強制初始值。
   - 原因：以 repeatable fixture 取代手動點 UI，消除環境變數。
   - 依賴：`tests/bootstrap.php`、`tests/Integration/TestCase.php`（已存在於 `ddf256a`）。
   - 風險：低。

2. **[Probe-1] 模擬同層級重排的 payload**（同檔）
   - 行動：以 `{from_tree, to_tree}` payload 直接呼叫 `CRUD::sort_posts($params)`
     （**不**透過 HTTP，避開 REST 層的權限檢查，直接驗寫入）。
     payload：`to_tree = [{id:102, menu_order:0, parent_id:100}, {id:103, menu_order:1, parent_id:100}, {id:101, menu_order:2, parent_id:100}]`。
   - 原因：用最小 surface 驗 Powerhouse 寫入層；若此層就錯，根因鎖 Layer B。

3. **[Probe-2] SQL SELECT 驗證**（同檔）
   - 行動：執行：
     ```sql
     SELECT ID, post_parent, menu_order, post_modified, post_status
     FROM {$wpdb->posts}
     WHERE ID IN (101, 102, 103)
     ORDER BY menu_order;
     ```
     斷言：
     - `101.menu_order == 2`、`102.menu_order == 0`、`103.menu_order == 1`
     - 三者 `post_parent == 100`
     - 三者 `post_modified > 測試開始時間`（R3/R5 驗證）
     - 三者 `post_status == 'publish'`（R6 誤刪驗證）
   - 原因：對應 Feature Rule 2 Example 1 的五個斷言。

4. **[Probe-3] 跨層級移動驗證**（同檔）
   - 行動：payload 把 `{id:203, menu_order:2, parent_id:101}` 加入 `to_tree`，
     呼叫 `sort_posts`，再 SELECT ID=203：
     ```sql
     SELECT ID, post_parent, menu_order, post_modified
     FROM {$wpdb->posts}
     WHERE ID = 203;
     ```
     斷言：`post_parent == 101`、`menu_order == 2`、`post_modified` 已更新。

5. **[Probe-4] Object Cache 驗證**（同檔）
   - 行動：在 `sort_posts` 完成後立刻呼叫：
     ```php
     $post = get_post( 101 );  // 會走 object cache
     wp_cache_flush();          // 強制清 runtime cache
     $post_fresh = get_post( 101 );
     ```
     比較兩者是否一致。若 `$post->menu_order != $post_fresh->menu_order`，
     代表 `wp_cache_flush_group('posts')` 沒清到（R2 成立）。

6. **[Probe-5] Transient 驗證**（同檔）
   - 行動：
     ```php
     $cache_key = 'power_docs_get_children_posts_html_100';
     set_transient( $cache_key, 'OLD_HTML', 3600 );  // 模擬前台已有快取
     // 呼叫 sort_posts
     $after = get_transient( $cache_key );
     ```
     斷言 `$after === false`（應已被清）。**預期此斷言會紅燈**（R3），
     作為 Phase 3 的紅燈依據。

7. **[Probe-Decision] 根據結果分支**
   - **Probe-2/3 失敗（DB 未如預期）** → 走 **Phase 1-C**（Powerhouse SQL 有 bug）
   - **Probe-2/3 通過、Probe-4 發現 cache stale** → 走 **Phase 1-B**（cache flush）
   - **Probe-2/3/4 都通過，但 UI 仍錯** → 走 **Phase 1-A**（前端）
   - **Probe-5 預期紅燈** → **必走 Phase 3**（與 A/B/C 並行）

**Phase 0 成功標準**：
- [ ] 建立可重現的 PHPUnit probe test（pass/fail 結果不論）
- [ ] 明確記錄哪一支斷言紅燈、哪一支綠燈
- [ ] 決定後續走 1-A / 1-B / 1-C 哪條分支（可多選）
- [ ] Probe 測試檔 commit 入 repo（作為永久 regression test）

**Phase 0 預估複雜度**：中（測試 fixture 設置 + 5 組 SELECT）

---

### Phase 1-A — 前端修復（若 Phase 0 確認 DB 寫入正確但 UI 錯）

#### 步驟

1. **[FE-1] 修正 `isEqual` 比對邏輯**
   - 檔案：`js/src/pages/admin/Docs/Edit/tabs/SortablePosts/utils/index.tsx:60-84`
   - 行動：`treeToParams` 回傳物件移除 `name`（僅為 debug 用），
     只保留 `{id, depth, menu_order, parent_id}`，避免 user-rename 之類的邊際 case 影響 diff。
   - 對應 Feature Rule 1：確保「實際結構有變」才發 POST。
   - 風險：低。
   - 影響範圍：僅 `isEqual` 比較，不影響後端 payload（後端只用 `id, menu_order, parent_id`）。

2. **[FE-2] 修正 `onError` 提示**
   - 檔案：`js/src/pages/admin/Docs/Edit/tabs/SortablePosts/index.tsx:111-116`
   - 行動：`message.loading` → `message.error`，讓使用者知道失敗。
   - 風險：低。

3. **[FE-3] 主動 `refetch` 取代僅 `invalidate`**
   - 檔案：`js/src/pages/admin/Docs/Edit/tabs/SortablePosts/index.tsx:117-122`
   - 行動：若 invalidate 在 `stale-while-revalidate` 下會回 stale，改為：
     ```typescript
     onSettled: async () => {
       await invalidate({ resource: 'posts', invalidates: ['list'] })
       // 若問題持續，再追加 queryClient.refetchQueries(...) 強制 refetch
     }
     ```
   - 風險：中（影響網路請求次數）。

4. **[FE-4] `useEffect` 依賴修正**
   - 檔案：`js/src/pages/admin/Docs/Edit/tabs/SortablePosts/index.tsx:57-81`
   - 行動：目前 `useEffect(() => { ... }, [isListFetching])` 只在 fetch 狀態改變時跑，
     若 posts 內容變但 fetching 狀態不變（React Query stale-while-revalidate）會 miss。
     改為 `useEffect(..., [isListFetching, posts])`，或用 `JSON.stringify(posts)` 作為 dep。
   - 風險：中（可能造成額外 render）。

5. **[FE-5] `sessionStorage` collapsed state 污染驗證**
   - 檔案：同上 L221-257（`getOpenedNodeIds`、`restoreOriginCollapsedState`）
   - 行動：在 `restoreOriginCollapsedState` 加 `console.warn` 確認 `newItem.collapsed = false`
     只影響 UI 不影響 `id / children / menu_order`。必要時寫單元測試。
   - 風險：低（目前看起來邏輯正確，但因是 helper，納入檢查以防回歸）。

**Phase 1-A 成功標準**：
- [ ] Feature Rule 1 E2E（Playwright）通過
- [ ] 前端 unit test 覆蓋 `treeToParams`、`isEqual` scenarios
- [ ] 手動 UI 測試：拖曳後 UI 不閃回舊順序

---

### Phase 1-B — Cache Flush 修復（若 Phase 0 Probe-4 紅燈）

**兩種選擇擇一**（依 R1 決定）：

#### 選項 B-Upstream（優先）：修 Powerhouse

1. **[CACHE-1] 補 `clean_post_cache()` per-ID**
   - 檔案：`powerhouse/inc/classes/Domains/Post/Utils/CRUD.php:258-264`
   - 行動：`wp_cache_flush_group` 之後，對每個 `$ids` 呼叫 `clean_post_cache()`：
     ```php
     $wpdb->query('COMMIT');

     // 清除文章內容快取
     \wp_cache_flush_group('posts');
     \wp_cache_flush_group('post_meta');

     // per-ID cache invalidation（Redis 安全）
     foreach ( $all_updated_ids as $post_id ) {
         \clean_post_cache( $post_id );
     }
     ```
   - 原因：`clean_post_cache()` 內部會 `wp_cache_delete( $post_id, 'posts' )` 並觸發
     `clean_post_cache` action，對所有 object cache drop-in 都有效。
   - 風險：低（純加法）。

2. **[CACHE-2] 發 PR 到 `j7-dev/wp-powerhouse` repo**
   - 行動：提 PR、合併、發 tag、在 power-docs `composer.json` 升版到含此修復的版本。
   - 風險：中（需 cross-repo 協作）。

#### 選項 B-Local Override（若 Powerhouse 無法即時發版）

3. **[CACHE-LOCAL-1] 新檔 `inc/classes/Domains/Doc/SortCacheFix.php`**
   - 行動：監聽 REST `posts/sort` 成功事件，在 power-docs 端補清 cache：
     ```php
     \add_filter( 'rest_post_dispatch', [ __CLASS__, 'clean_cache_after_sort' ], 10, 3 );

     public static function clean_cache_after_sort( $response, $server, $request ) {
         if ( $request->get_route() !== '/v2/powerhouse/posts/sort' ) return $response;
         if ( $response->is_error() ) return $response;

         $body = $request->get_json_params();
         $to_tree = $body['to_tree'] ?? [];
         foreach ( $to_tree as $node ) {
             \clean_post_cache( (int) $node['id'] );
         }
         return $response;
     }
     ```
   - 原因：不動 Powerhouse；用 REST 後處理 hook 精準清快取。
   - 風險：中（若 Powerhouse 未來自己加 `clean_post_cache`，會重複但無害）。

4. **[CACHE-LOCAL-2] 在 `Bootstrap.php` 註冊**
   - 檔案：`inc/classes/Bootstrap.php` constructor
   - 行動：`SortCacheFix::instance();`

**Phase 1-B 成功標準**：
- [ ] Probe-4 綠燈（`get_post(101)` 與 flush 後一致）
- [ ] 若走 Local Override，power-docs 自身 Integration test 通過
- [ ] Redis Object Cache 環境手動驗證（Phase 2）

---

### Phase 1-C — Powerhouse SQL 寫入邏輯修復（若 Phase 0 Probe-2/3 紅燈）

此分支為最重情境；必須修 Powerhouse 本身（與 Phase 1-B 同樣面對 R1）。

#### 步驟

1. **[SQL-1] 驗證 CASE WHEN UPDATE 正確性**
   - 檔案：`powerhouse/inc/classes/Domains/Post/Utils/CRUD.php:213-254`
   - 行動：以 Phase 0 Probe 測試資料，手動印 `$sql`，逐欄檢查 `%d` 綁定、`WHERE ID IN` 子句。
     常見 bug：
     - `$ids` 為空時 `WHERE ID IN ()` → SQL syntax error（雖然 batch_size=50 下少見，但邊界情境要驗）
     - `parent_id = 0` 被解讀為 root（WP 慣例）但 pd_doc 裡 0 = 無父，這是合法的；須確認不會誤刪章節。
   - 風險：中。

2. **[SQL-2] 修正 `delete_ids` 邏輯避免誤刪（R6）**
   - 檔案：`CRUD.php:271-282`
   - 行動：當前 `from_tree - to_tree = delete_ids` 直接 `wp_trash_post`。
     此行為假設前端會把「要刪的節點」從 `to_tree` 剔除——但前端拖拽**不會**觸發刪除意圖。
     修正為：
     ```php
     // 只在前端明確標記時刪除；否則保留
     $delete_ids = $params['delete_ids'] ?? [];  // 改為前端明確傳入
     ```
     或加防呆：「僅當 `from_tree` 中該節點 `parent_id` 也已被刪除時才 trash」。
   - 風險：**高**（行為變更，可能影響 power-course）→ **Phase 2 必須執行 power-course 迴歸**。
   - 相容性考量：若 power-course 依賴此舊行為，新增 opt-in 參數 `{ legacy_delete_missing: true }`。

3. **[SQL-3] Exception 轉 `\WP_Error`（R5）**
   - 檔案：`CRUD.php:265-269`
   - 行動：
     ```php
     } catch ( \Exception $e ) {
         $wpdb->query('ROLLBACK');
         return new \WP_Error( 'sort_failed', $e->getMessage(), [ 'status' => 500 ] );
     }
     ```
     並修 V2Api 呼叫處 L352-356 讓 `\WP_Error` 能正確回傳。

4. **[SQL-4] 考慮 `menu_order * 10`（R4）**
   - 決策：**不改**（保持 Powerhouse 現有行為）。理由：
     - pd_doc 既有 DB 無 * 10 慣例
     - power-course 自己有 sort_chapters 已乘 10，未來需 pd_doc 插入中間節點時再說
   - 風險：低。

5. **[SQL-5] Local Override 路徑（若 Powerhouse 無法即時修）**
   - 檔案：`inc/classes/Domains/Doc/SortOverride.php`（新）
   - 行動：在 `rest_api_init` priority 100 重新註冊 `/posts/sort`，callback 指向 power-docs 自家邏輯。
     ```php
     \add_action( 'rest_api_init', [ __CLASS__, 'override_sort_route' ], 100 );

     public static function override_sort_route(): void {
         \register_rest_route(
             'v2/powerhouse',
             '/posts/sort',
             [
                 'methods'             => 'POST',
                 'callback'            => [ __CLASS__, 'handle_sort' ],
                 'permission_callback' => [ __CLASS__, 'can_sort' ],
                 'override'            => true,  // WP 6.x 支援
             ]
         );
     }
     ```
     實作 `handle_sort()` 時：
     - 限制 `post_type = pd_doc`（避免影響 power-course）
     - 採修正後 SQL 邏輯（不誤刪、回 WP_Error、清 cache）
   - 風險：中（需確保 `power-course` 的 chapter 排序不受影響——power-course 用獨立的 `chapters/sort` endpoint，應無衝突）。

**Phase 1-C 成功標準**：
- [ ] Probe-2/3 綠燈
- [ ] Feature Rule 2 兩個 Examples 皆綠燈
- [ ] power-course SortableChapters 迴歸測試通過（Phase 2）

---

### Phase 2 — 迴歸與環境測試

#### 步驟

1. **[REG-1] power-course 迴歸測試**
   - 檔案：N/A（跨外掛測試）
   - 行動：
     - 手動在 `#/courses/edit/:id` 的章節管理執行「同層級重排」與「跨層級移動」
     - 確認 power-course 的 `Resources/Chapter/Utils/Utils::sort_chapters` 未被本次改動影響
       （因 power-course 呼叫自己的 endpoint，不經過 Powerhouse `posts/sort`）
     - **關鍵**：若 Phase 1-C 修了 Powerhouse `sort_posts`，確認 power-course 沒有其他地方間接呼叫它
   - 驗證指令：`grep -r "CRUD::sort_posts\|sort_posts(" wp-content/plugins/power-course/`
   - 風險：低（power-course 有自己的 `sort_chapters`）。

2. **[REG-2] Redis Object Cache 環境驗證**
   - 行動：
     - 啟用 Redis Object Cache drop-in（若有）
     - 重跑 Phase 0 SQL Probe
     - 確認 Probe-4 綠燈
   - 風險：中（需測試環境具 Redis）。若無，明確標記為 **deferred 驗證**，於生產環境部署後以 staging 驗證。

3. **[REG-3] 其他 Powerhouse 消費端掃描**
   - 行動：
     ```
     grep -rn "posts/sort\|CRUD::sort_posts" wp-content/plugins/ | grep -v vendor
     ```
   - 列出所有呼叫者，逐一回顧行為一致性。

4. **[REG-4] PHPStan + PHPCS**
   - 指令：`vendor/bin/phpstan analyse`、`vendor/bin/phpcs`
   - 所有改動檔皆需通過。

**Phase 2 成功標準**：
- [ ] power-course 章節排序行為未改變
- [ ] Redis 環境（可延後）驗證 Probe-4 綠燈
- [ ] 靜態分析全綠

---

### Phase 3 — 前台 Transient 清除（必做，與 Phase 1 並行）

**對應 R3**：批次 SQL 繞過 `save_post_pd_doc` hook，`power_docs_get_children_posts_html_{top_parent_id}` transient 永遠陳舊。

#### 步驟

1. **[TRANS-1] 新檔 `inc/classes/Domains/Doc/SortTransientFix.php`**
   - 行動：
     ```php
     <?php
     declare(strict_types=1);
     namespace J7\PowerDocs\Domains\Doc;

     use J7\Powerhouse\Domains\Post\Utils\CRUD as PostUtils;
     use J7\PowerDocs\Domains\Doc\Utils;

     final class SortTransientFix {
         use \J7\WpUtils\Traits\SingletonTrait;

         public function __construct() {
             \add_filter( 'rest_post_dispatch', [ __CLASS__, 'clear_sidebar_cache' ], 10, 3 );
         }

         public static function clear_sidebar_cache( $response, $server, $request ) {
             if ( $request->get_route() !== '/v2/powerhouse/posts/sort' ) return $response;
             if ( $response->is_error() ) return $response;

             $body    = $request->get_json_params();
             $to_tree = $body['to_tree'] ?? [];

             // 收集所有受影響 root doc IDs
             $root_ids = [];
             foreach ( $to_tree as $node ) {
                 $top = PostUtils::get_top_post_id( (int) $node['id'] );
                 if ( CPT::POST_TYPE === \get_post_type( $top ) ) {
                     $root_ids[ $top ] = true;
                 }
             }

             foreach ( array_keys( $root_ids ) as $root_id ) {
                 \delete_transient( Utils::get_cache_key( $root_id ) );
             }

             return $response;
         }
     }
     ```
   - 原因：REST 後處理 hook 精準監聽本 endpoint，僅清 pd_doc 受影響 root 的 transient。
   - 風險：低。

2. **[TRANS-2] 在 `Bootstrap.php` constructor 註冊**
   - 檔案：`inc/classes/Bootstrap.php`
   - 行動：`Domains\Doc\SortTransientFix::instance();`

3. **[TRANS-3] Integration test**
   - 檔案：`tests/Integration/SortTransientTest.php`（新）
   - 行動：
     ```php
     set_transient( 'power_docs_get_children_posts_html_100', 'OLD', 3600 );
     $request = new \WP_REST_Request( 'POST', '/v2/powerhouse/posts/sort' );
     $request->set_body_params( [ 'from_tree' => [...], 'to_tree' => [...] ] );
     rest_do_request( $request );
     $this->assertFalse( get_transient( 'power_docs_get_children_posts_html_100' ) );
     ```

**Phase 3 成功標準**：
- [ ] Probe-5 綠燈
- [ ] 前台 `single-pd_doc.php` 的 doc-detail 三欄模板，拖拽後重整看到新順序（E2E）

---

## 測試策略

### 層級對應

| 層級 | 對應 Feature 內容 | 測試檔案（建議路徑） | 執行指令 |
|------|-------------------|----------------------|---------|
| **Integration Test（PHPUnit）** | Rule 2（資料持久化） | `tests/Integration/SortPostsProbeTest.php`、`tests/Integration/SortPostsBehaviorTest.php`、`tests/Integration/SortTransientTest.php` | `composer test:integration` |
| **Unit Test（前端）** | `treeToParams` / `isEqual` 邏輯 | `js/src/pages/admin/Docs/Edit/tabs/SortablePosts/utils/__tests__/treeToParams.test.ts`（新，需設 Vitest） | `pnpm test`（若無，先 defer） |
| **E2E（Playwright）** | Rule 1（UI 行為） | `tests/e2e/03-integration/sortable-posts-drag.spec.ts`（新） | `pnpm playwright test` |

### 關鍵斷言

**Integration（Rule 2）**：
- `menu_order` 精確值（0/1/2）
- `post_parent` 精確值
- `post_modified > $start_time`
- `post_status == 'publish'`（沒誤刪）
- `get_transient($cache_key) === false`（沒陳舊 transient）

**E2E（Rule 1）**：
- 拖拽後 UI 立即顯示新順序
- 重整頁面後順序維持
- 關閉瀏覽器再開仍維持

### 邊界情境

1. 從頂層章節底下拖出所有單元 → 章節變空
2. 多層嵌套（depth=2）後再拖回 depth=0（應被 `MAX_DEPTH` 阻擋）
3. 快速連續拖拽（race condition）
4. 網路中斷時拖拽
5. 其他人同時在另一個 tab 編輯同一個知識庫

---

## 依賴項目

| 依賴 | 版本 | 用途 |
|------|------|------|
| `j7-dev/wp-powerhouse` | 3.3.11+ | `CRUD::sort_posts` 的修復來源 |
| `phpunit/phpunit` | ^9.0（已在 require-dev） | Integration test runner |
| `wp-phpunit/wp-phpunit` | ^6.0（已在 require-dev） | WP test suite |
| Playwright | 已在 `tests/e2e/package.json` | E2E runner |
| Redis Object Cache drop-in | 可選 | Phase 2 驗證 |

---

## 風險與緩解措施

- **高**：Powerhouse 為共用層，改動橫向影響 power-course / power-shop
  → 採 Local Override 優先；修 upstream 時跨 plugin 迴歸測試（Phase 2 必做）
- **高**：R6 `wp_trash_post(delete_ids)` 誤刪節點
  → Phase 0 必驗 `post_status`；Phase 1-C 修正邏輯且提供 legacy opt-in
- **中**：Redis Object Cache 環境無法在本地重現
  → Phase 2 定義 staging 驗證 checklist，必要時推遲到部署後
- **中**：無法修 Powerhouse upstream（時程、發版流程）
  → 全套 Local Override 方案備選（CACHE-LOCAL、SQL-5）
- **低**：前端 `useEffect` 依賴修正影響其他 tab
  → 檔案 scope 僅 SortablePosts，不跨元件

---

## 錯誤處理策略

1. **前端**：統一 `message.error` + loading 關閉；`useCustomMutation` 的 `onError` 必須呼叫 `message.destroy` 或用 `message.error({ key })` 覆蓋同 key 的 loading。
2. **後端**：所有批次 SQL 失敗回 `\WP_Error`（而非 throw），HTTP response 帶具體 `code` 與 `message`。
3. **資料完整性**：以 `$wpdb->query('START TRANSACTION')` 保底（Powerhouse 已有）；額外在 Phase 1-C 保守化 `$delete_ids` 邏輯。
4. **Cache 一致性**：per-ID `clean_post_cache()` + transient 精準清除。
5. **測試**：所有失敗模式都需對應 Integration / E2E 測試。

---

## 限制條件

本計劃**不會**做的事：

- 不處理 `pd_doc` 以外 post type 的排序（如 `post`, `page`, WooCommerce products）
- 不調整 `MAX_DEPTH = 2` 的業務規則
- 不新增「批量刪除章節」以外的刪除行為
- 不改 SortableTree（`@ant-design/pro-editor`）套件內部邏輯
- 不處理 i18n（`power-docs` 既有 `power_docs`、`power-docs` 兩套 text domain 的相容問題）
- 不優化排序效能（> 1000 節點的極端情況不在範圍內）
- 不修改 `powerhouse/posts/sort` 以外的 Powerhouse endpoint

---

## 成功標準

- [ ] Phase 0 SQL probe test 完成、根因分支決定
- [ ] Feature `Rule 1` Example 1（同層級重排）E2E 綠燈
- [ ] Feature `Rule 1` Example 2（跨層級移動）E2E 綠燈
- [ ] Feature `Rule 2` Example 1 Integration 綠燈（`menu_order` + `post_parent` + `post_modified`）
- [ ] Feature `Rule 2` Example 2 Integration 綠燈
- [ ] Phase 3 transient 清除 Integration 綠燈
- [ ] power-course SortableChapters 迴歸測試通過（手動或自動）
- [ ] PHPStan + PHPCS 全綠
- [ ] 所有新增檔案遵循 `J7\PowerDocs` namespace 與 SingletonTrait 規範

---

## 預估複雜度：中

（依分支而定：1-A 低、1-B 低–中、1-C 中–高）

---

## 交付 tdd-coordinator 的 Issue 拆分建議

### Issue #0 — SQL Probe（**前置條件**，阻塞後續所有 Issue）

- **範圍**：Phase 0 全部
- **產出**：`tests/Integration/SortPostsProbeTest.php` + 根因分支決策報告
- **相依**：無
- **TDD**：Red（建立 probe test）→ Red 結果分類 → 決策報告
- **Worktree**：`.claude/worktrees/sort-probe`
- **阻塞**：Issue #1/#2/#3 直到決策完成

### Issue #1 — Layer A 前端修復（條件式）

- **範圍**：Phase 1-A
- **產出**：FE-1 ~ FE-5 全部
- **相依**：Issue #0 決策為「1-A 需執行」
- **TDD**：Red（寫 E2E for Rule 1）→ Green（修 isEqual / onError / useEffect）→ Refactor
- **Worktree**：`.claude/worktrees/sort-fe`（可與 #2 並行）

### Issue #2 — Layer B1 Cache Flush 修復（條件式）

- **範圍**：Phase 1-B 全部（含選項 B-Upstream 與 B-Local Override，擇一）
- **產出**：Powerhouse PR（若 B-Upstream）或 `SortCacheFix.php`（若 B-Local）
- **相依**：Issue #0 決策為「1-B 需執行」
- **TDD**：Red（Probe-4）→ Green（clean_post_cache）→ Refactor
- **Worktree**：`.claude/worktrees/sort-cache`（若修 Powerhouse，另開 powerhouse 專屬 worktree）

### Issue #3 — Layer B2 Powerhouse SQL 寫入修復（條件式，**最重要**）

- **範圍**：Phase 1-C 全部
- **產出**：Powerhouse `CRUD::sort_posts` 修正 + `SortOverride.php`（local fallback）
- **相依**：Issue #0 決策為「1-C 需執行」
- **TDD**：Red（Probe-2/3）→ Green（修 SQL / delete_ids / WP_Error）→ Refactor
- **Worktree**：**必須獨立** `.claude/worktrees/sort-sql`；**若修 Powerhouse，另開 `powerhouse/.claude/worktrees/sort-fix` 並行**

### Issue #4 — Phase 3 Transient Fix（**必做**，與 #1/#2/#3 並行）

- **範圍**：Phase 3 全部
- **產出**：`SortTransientFix.php` + `SortTransientTest.php`
- **相依**：Issue #0 完成（不需等 #1/#2/#3）
- **TDD**：Red（Probe-5 或獨立 test）→ Green → Refactor
- **Worktree**：`.claude/worktrees/sort-transient`

### Issue #5 — 迴歸與整合驗證

- **範圍**：Phase 2 全部
- **產出**：迴歸測試報告、Redis 驗證記錄
- **相依**：#1, #2, #3, #4 全部完成
- **TDD**：以 Manual / Exploratory 為主
- **Worktree**：不需獨立 worktree

---

## TDD 執行順序建議

```
Issue #0（SQL Probe）─┬─▶ [決策]
                     │
                     ├─▶ Issue #1（前端）  ┐
                     ├─▶ Issue #2（Cache）  ├─▶ Issue #5（迴歸）
                     ├─▶ Issue #3（SQL）    │
                     └─▶ Issue #4（Transient）┘
```

1. **必先**：Issue #0（無根因決策不得開工）
2. **可並行**：Issue #1, #2, #3, #4（依 Phase 0 決策挑選需做的；#4 恆做）
3. **最終合流**：Issue #5

---

## Worktree 策略建議

- **power-docs 端**：每個 Issue 獨立 worktree（已是現行慣例 `.claude/worktrees/<id>`）
- **Powerhouse 端**（Issue #2 B-Upstream 或 #3 要修 upstream 時）：
  - 建議在 `wp-content/plugins/powerhouse/.claude/worktrees/sort-fix`（若 Powerhouse repo 具 worktree 慣例）
  - 或以 fork 方式 clone 出獨立 workspace
  - power-docs `composer.json` 暫以 `path` repository 指向本地 worktree，加速驗證：
    ```json
    "repositories": [
      { "type": "path", "url": "../powerhouse", "options": { "symlink": true } }
    ]
    ```
  - 合 Powerhouse PR 並發版後，改回 VCS repository
- **跨 plugin 驗證**：Issue #5 可在主 worktree（無隔離）執行，便於同時啟動 power-docs / power-course / Redis

---

## 附錄：關鍵檔案路徑索引

| 檔案 | 角色 |
|------|------|
| `js/src/pages/admin/Docs/Edit/tabs/SortablePosts/index.tsx` | 前端入口（SortableTree、handleSave、isEqual） |
| `js/src/pages/admin/Docs/Edit/tabs/SortablePosts/utils/index.tsx` | `treeToParams`、`postToTreeNode` |
| `js/src/pages/admin/Docs/Edit/tabs/SortablePosts/hooks/index.tsx` | `usePostsList` useList query |
| `js/src/pages/admin/Docs/Edit/tabs/SortablePosts/atom.tsx` | Jotai atoms |
| `inc/classes/Domains/Doc/CPT.php` | `save_post_pd_doc` transient 清除 |
| `inc/classes/Domains/Doc/Api.php` | Powerhouse filter 擴展（無涉 sort） |
| `inc/classes/Domains/Doc/Utils.php` | `get_cache_key` |
| `inc/classes/Bootstrap.php` | 子域實例化入口（新 SortTransientFix 註冊處） |
| `tests/Integration/TestCase.php` | `create_doc`、`create_nested_doc` helpers |
| `tests/bootstrap.php` | 載入 Woo → Powerhouse → Power Docs |
| `wp-content/plugins/powerhouse/inc/classes/Domains/Post/Utils/CRUD.php:195` | **`sort_posts` 實作（修復核心）** |
| `wp-content/plugins/powerhouse/inc/classes/Domains/Post/Core/V2Api.php:345` | `post_posts_sort_callback` |
| `wp-content/plugins/power-course/inc/classes/Resources/Chapter/Utils/Utils.php:200` | 對照組：power-course 的 `sort_chapters` |

---

## 交接聲明

本計劃遵循 **HOLD SCOPE** 範圍模式，目的為修復已知 bug，**不擴張範圍**。
Plan 完成後將直接交接 `@zenbu-powers:tdd-coordinator` 執行：

1. 先開 **Issue #0**（SQL Probe）走 Red → 決策
2. 依決策拆分並行 **Issue #1 ~ #4**
3. 最後執行 **Issue #5** 迴歸驗證

交接不需再詢問用戶（計劃已包含完整分支策略與決策機制）。
