# Bug: SortablePosts 拖拽排序後 menu_order / post_parent 疑似未持久化

## 概述

知識庫管理員在 `#/docs/edit/:id` 的 **章節管理（SortablePosts）** 分頁拖拽章節後，
前端呼叫 `POST /posts/sort`（body: `{ from_tree, to_tree }`）收到成功回應，
但部分情境下：

- `wp_posts.menu_order` 或 `post_parent` 未如預期被寫入
- 或寫入成功但前端重新載入時樹狀結構與拖拽結果不一致

此問題影響知識庫內容編排的可靠性，嚴重時會導致管理員重複拖拽、內容順序錯亂。

## 影響範圍

| 項目 | 值 |
|------|----|
| 功能模組 | 章節管理（SortablePosts） |
| 路由 | `#/docs/edit/:id`（章節管理分頁） |
| 前端入口 | `js/src/pages/admin/Docs/Edit/tabs/SortablePosts/index.tsx` |
| 後端端點 | `POST /posts/sort`（Powerhouse 共用層提供） |
| 資料表 | `wp_posts`（欄位：`menu_order`、`post_parent`、`post_modified`） |
| CPT | `pd_doc` |

## 根因範圍（待驗證）

根因**可能橫跨兩層**，dev 階段需先以 SQL 驗證後再決定修復層級：

### Layer A — power-docs 本地

位於 `js/src/pages/admin/Docs/Edit/tabs/SortablePosts/`：

- `from_tree` / `to_tree` 組裝邏輯（是否正確反映拖拽後的樹狀結構）
- lodash `isEqual` 比對（是否誤判為「無變化」而略過 POST）
- `invalidate` / refetch 時機（是否在 mutation 完成前已讀到舊資料）
- `sessionStorage` 展開狀態還原（是否污染 `to_tree` 結構）

### Layer B — Powerhouse 共用層

`CRUD::sort_posts`（`j7-dev/wp-powerhouse`）的寫入邏輯本身：

- 是否完整寫入所有受影響節點的 `menu_order`
- 是否正確處理跨層級移動時的 `post_parent` 更新
- 是否在某些樹狀結構（深度 2、節點跨父節點移動）下遺漏節點

## 修復策略（條件式）

| SQL 驗證結果 | 根因層級 | 修復方式 |
|-------------|---------|---------|
| DB 已正確寫入，但前端顯示錯誤 | Layer A（前端 state / invalidate 時機） | 直接修 `power-docs` 本地 SortablePosts 相關程式碼 |
| DB 寫入不完整或不一致 | Layer B（Powerhouse `CRUD::sort_posts`） | **優先**直接修 `j7-dev/wp-powerhouse`；若無法立即修，採 local override |
| 兩者皆有 | 分別修復 | Layer A 修本地、Layer B 修共用層 |

## 驗證流程（Dev 第一步）

### Step 1：手動重現並執行 SQL SELECT

1. 於測試環境建立符合 Feature Background 的 `pd_doc` 節點樹（1 個 root、3 個章節、3 個單元）
2. 執行「同層級重排」情境：將章節一拖至章節三之後
3. 立即執行：

   ```sql
   SELECT ID, post_parent, menu_order, post_modified
   FROM wp_posts
   WHERE ID IN (101, 102, 103)
   ORDER BY menu_order;
   ```

4. 執行「跨層級移動」情境：將單元 2-1 從章節二移到章節一之下
5. 立即執行：

   ```sql
   SELECT ID, post_parent, menu_order, post_modified
   FROM wp_posts
   WHERE ID = 203;
   ```

### Step 2：根據 SQL 結果進入 Feature 紅燈

依 `specs/features/sortable-posts/知識庫章節拖拽排序.feature` 的 **Rule 2（資料持久化）**
Example 產出 PHP 整合測試或前端 IT，應呈現紅燈（未通過）。

### Step 3：依根因層級選擇修復路徑

根據驗證結果決定：
- Layer A → 在 `power-docs` 本地進入 green 階段
- Layer B → 先在 Powerhouse 修 → Power Docs composer update → 再驗 Feature

## 驗證斷言點

Feature spec 已明確驗證三欄位：

- `wp_posts.menu_order`（排序核心）
- `wp_posts.post_parent`（跨層級移動核心）
- `wp_posts.post_modified`（確認寫入確實發生，排除「查到舊資料」的疑慮）

## 測試涵蓋情境

| 情境 | Feature Example | 目的 |
|------|----------------|------|
| 同層級重排 | `同層級重排—章節一從第 1 位拖到第 3 位後...` | 驗 `menu_order` 重新分配 |
| 跨層級移動 | `跨層級移動—單元 2-1 從章節二拖到章節一之下...` | 驗 `post_parent` 重新綁定 + `menu_order` |

## TBD 項目（待 dev 階段釐清）

- [ ] **根因層級確認**：Layer A / Layer B / 兩者皆有（依 Step 1 SQL 結果）
- [ ] **是否需要 composer 更新 Powerhouse**：若根因在 Layer B，需確認 `j7-dev/wp-powerhouse` 是否能即時發版
- [ ] **是否需 local override**：若 Powerhouse 無法即時修，power-docs 是否以 filter / override 臨時覆蓋 `CRUD::sort_posts`
- [ ] **`post_modified` 更新機制**：Powerhouse 是否主動更新此欄位，還是依賴 WordPress core 的 `wp_update_post`；若未更新，Feature 斷言需調整
- [ ] **transient 快取清除時機**：`power_docs_get_children_posts_html_{top_parent_id}` 是否在 sort 後被正確清除（避免前端雖刷新但讀到舊側邊欄 HTML）
- [ ] **`from_tree` 資料語義**：目前程式是否仍把 `from_tree` 送到後端，是否為後端寫入所需，或僅作前端 diff 用途

## 關聯 Feature

- `specs/features/sortable-posts/知識庫章節拖拽排序.feature`

## 關聯 Clarify Session

- `specs/clarify/2026-04-20-1731.md`
