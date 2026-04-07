# Power Docs — CLAUDE.md

> WordPress 知識庫變現外掛。巢狀 CPT `pd_doc`、WooCommerce 購買授權、Refine.dev SPA 管理後台、三種前台模板。
> **Plugin Version:** 1.2.7 | **PHP Namespace:** `J7\PowerDocs` | **Text Domain:** `power_docs`

---

## 技術棧

| 層級 | 技術 |
|------|------|
| PHP | 8.0+（`declare(strict_types=1)`）、PSR-4 autoload（`J7\PowerDocs\` -> `inc/classes/`） |
| WordPress | 5.7+ |
| WooCommerce | 7.6.0+（必要依賴） |
| Powerhouse | 3.3.11+（必要依賴 `j7-dev/wp-powerhouse`，提供 REST API、Limit 模型、前台 toolkit） |
| PHP 工具庫 | `kucrut/vite-for-wp ^0.8`、`j7-dev/wp-plugin-trait ^0.2`（PluginTrait + SingletonTrait） |
| 前端框架 | React 18 + TypeScript（strict）+ Refine.dev（@refinedev/core 4.x + @refinedev/antd 5.x） |
| UI | Ant Design 5 + `antd-toolkit` 1.3.x + TailwindCSS 3 + DaisyUI 4（prefix: `pc-`） |
| 狀態管理 | @tanstack/react-query 4 + Jotai |
| 路由 | react-router 7（HashRouter） |
| 富文字編輯 | BlockNote 0.30（via `antd-toolkit` DescriptionDrawer） |
| 拖拽排序 | @ant-design/pro-editor SortableTree |
| 建置 | Vite 6（via `@kucrut/vite-for-wp ^0.11`，port 5175，output: `js/dist`） |
| 程式碼風格 | PHPCS（WordPress-Core）+ PHPStan + ESLint + Prettier |

---

## 目錄結構

```
power-docs/
├── plugin.php                          # 主入口（PluginTrait + SingletonTrait）
├── inc/classes/
│   ├── Bootstrap.php                   # 初始化所有子域 + enqueue script + env localization
│   ├── Admin/Entry.php                 # 全屏 React 管理頁面（current_screen hook）
│   ├── Domains/
│   │   ├── Doc/
│   │   │   ├── Loader.php             # 實例化 Doc 子模組
│   │   │   ├── CPT.php                # 註冊 pd_doc（POST_TYPE 常數）
│   │   │   ├── Api.php                # Powerhouse REST filter 擴展（meta、檔案上傳、預設值、複製）
│   │   │   ├── Access.php             # 存取控制：can_access() + WC 訂單授權
│   │   │   ├── Templates.php          # single_template 覆寫 + admin bar
│   │   │   └── Utils.php              # 快取 key 生成 + 遞迴側邊欄 HTML
│   │   ├── Product/Api.php            # 商品 bound_docs_data meta 暴露
│   │   ├── User/Api.php               # 自訂 /users endpoint（granted_docs SQL 查詢）
│   │   └── Elementor/
│   │       ├── Loader.php             # Widget 註冊（檢查 Elementor 啟用）
│   │       ├── Card.php               # 知識庫卡片 Widget
│   │       └── Search.php             # 搜尋框 Widget
│   ├── Helper/TOCGenerator.php        # DOMDocument 目錄生成器（h2-h6 -> anchor）
│   ├── Compatibility/Compatibility.php # upgrader_process_complete 版本遷移
│   └── Utils/Base.php                 # APP1_SELECTOR = '#power_docs'
├── inc/templates/
│   ├── single-pd_doc.php              # 模板分派器：landing / detail / search
│   └── pages/
│       ├── doc-landing/index.php      # 知識庫首頁（hero + 子文章卡片）
│       ├── doc-detail/                # 三欄詳情頁（sider + main + toc）
│       └── doc-search/index.php       # 搜尋結果（關鍵字高亮 + 分頁）
├── js/src/
│   ├── main.tsx                       # React 掛載入口
│   ├── App1.tsx                       # Refine Shell（6 個 dataProvider + HashRouter）
│   ├── resources/index.tsx            # Refine 資源定義
│   ├── hooks/useEnv.tsx               # 型別化環境變數 hook
│   ├── pages/admin/                   # 管理頁面（Docs/Users/DocAccess/Media）
│   ├── components/                    # 可重用元件
│   ├── types/                         # TypeScript 型別定義
│   └── utils/                         # 工具函式
├── spec/                              # 專案規格（Event Storming + features + API spec）
└── tests/e2e/                         # Playwright E2E 測試
```

---

## CPT: `pd_doc`

- **常數**: `CPT::POST_TYPE = 'pd_doc'`
- **階層式**: 支援三級結構（知識庫 root -> 章節 depth=1 -> 單元 depth=2）
- **Admin 可見性**: 僅 `WP_ENVIRONMENT_TYPE=local` 時顯示在 WP 選單
- **REST**: `show_in_rest = true`
- **Supports**: title, editor, thumbnail, custom-fields, author, page-attributes

### 關鍵 Meta

| Meta Key | 層級 | 說明 |
|----------|------|------|
| `editor` | 全部 | `'power-editor'` / `'elementor'` / `''`（root 可為空=預設版型） |
| `need_access` | Root | `'yes'` / `'no'` — 是否需要購買授權 |
| `bg_images` | Root | attachment ID（背景圖） |
| `pd_keywords` | Root | `[{id, title}]` 搜尋關鍵字 |
| `pd_keywords_label` | Root | 關鍵字標籤（預設 `'大家都在搜：'`） |
| `unauthorized_redirect_url` | Root | 未授權跳轉 URL（預設 `site_url('404')`） |

---

## 存取控制

```
Access::can_access($post_id, $user_id?)
  1. need_access == 'no' → true（免費）
  2. 未登入 → false
  3. 查詢 ph_access_itemmeta.expire_date → !is_expired
```

**授權流程**: `woocommerce_order_status_completed` -> 讀取商品 `bound_docs_data` -> `BoundItemData::grant_user()` 寫入 `ph_access_itemmeta`

**管理員**: `current_user_can('manage_options')` 直接繞過存取控制

---

## REST API

| Provider | Base URL | 用途 |
|----------|----------|------|
| default | `/v2/powerhouse` | Powerhouse CRUD（posts/users/products） |
| wp-rest | `/wp/v2` | WordPress Core REST |
| wc-rest | `/wc/v3` | WooCommerce REST |
| wc-store | `/wc/store/v1` | WC Store API |
| bunny-stream | Bunny CDN | Bunny 流媒體 |
| power-docs | `/power-docs` | 本外掛自訂端點 |

**自訂端點**: `GET /power-docs/v1/users` — 支援 `granted_docs` SQL JOIN 篩選

**擴展方式**: 透過 Powerhouse filter 擴展，不自建 /posts 或 /products 端點：
- `powerhouse/post/get_meta_keys_array` — 暴露 meta
- `powerhouse/post/separator_body_params` — 檔案上傳
- `powerhouse/post/create_post_args` — 建立預設值
- `powerhouse/copy/children_post_args` — 複製時保持 post_type
- `powerhouse/product/get_meta_keys_array` — 商品 meta
- `powerhouse/user/get_meta_keys_array` — 用戶 meta

---

## 前台模板

| 模板 | 觸發條件 | 說明 |
|------|----------|------|
| `doc-landing` | `post_parent == 0` 且無 search | hero + 子文章卡片格 |
| `doc-detail` | `post_parent > 0` | 三欄：sider(導航樹) + main(內容) + toc(目錄) |
| `doc-search` | URL 含 `?search=` | 搜尋結果 + 關鍵字高亮 + 分頁 |

- 主題可覆寫：在 theme 目錄放 `single-pd_doc.php`
- Elementor 支援：`editor === 'elementor'` 時使用 `the_content()` 渲染
- TOC: `TOCGenerator` 用 DOMDocument 解析 h2-h6，注入 anchor ID
- 側邊欄: `Utils::get_children_posts_html_uncached()` 遞迴生成，有 transient 快取

---

## 前端管理頁面

| 路由 | 元件 | 說明 |
|------|------|------|
| `#/docs` | DocsList | 知識庫列表（CRUD） |
| `#/docs/edit/:id` | DocsEdit | 三標籤編輯：描述 / 文章管理(SortableTree) / 權限管理 |
| `#/users` | Users | 學員管理（授權/撤銷/更新期限） |
| `#/doc-access` | DocAccess | 商品 <-> 知識庫綁定 |
| `#/media-library` | WpMediaLibraryPage | WordPress 媒體庫 |
| `#/bunny-media-library` | BunnyMediaLibraryPage | Bunny 流媒體庫 |

**SortablePosts**: MAX_DEPTH=2，拖拽後 POST `/posts/sort` { from_tree, to_tree }，isEqual 檢查避免無效請求

---

## 環境變數

PHP 透過 `PowerhouseUtils::simple_encrypt()` 加密後以 `window.power_docs_data.env` 傳遞給前端。

前端使用 `useEnv()` hook（from `@/hooks`）解密存取，型別為 `Env`（繼承 `TEnv`）。

關鍵變數：`SITE_URL`, `API_URL`, `NONCE`, `DOCS_POST_TYPE(pd_doc)`, `BOUND_META_KEY(bound_docs_data)`, `ELEMENTOR_ENABLED`, `BUNNY_*`, `AXIOS_INSTANCE`

---

## Hooks 參考

### Actions
| Hook | Priority | Class | 說明 |
|------|----------|-------|------|
| `init` | default | CPT | 註冊 pd_doc |
| `admin_enqueue_scripts` | default | Bootstrap | Enqueue React app |
| `current_screen` | 10 | Admin\Entry | 全屏管理頁面 |
| `admin_bar_menu` | 210 | Templates | 「編輯知識庫」連結 |
| `woocommerce_order_status_completed` | 10 | Access | 購買授權 |
| `save_post_pd_doc` | 10 | CPT | 清除 transient + Elementor data |
| `upgrader_process_complete` | default | Compatibility | 版本遷移 |
| `elementor/widgets/register` | default | Elementor\Loader | 註冊 Widget |

### Filters
| Hook | Priority | Class | 說明 |
|------|----------|-------|------|
| `single_template` | 9999 | Templates | 模板覆寫 |
| `option_elementor_cpt_support` | default | CPT | 加入 Elementor 支援 |
| `powerhouse/post/get_meta_keys_array` | 10 | Doc\Api | 暴露 editor, bg_images |
| `powerhouse/post/separator_body_params` | 10 | Doc\Api | bg_images 檔案上傳 |
| `powerhouse/post/create_post_args` | 10 | Doc\Api | root doc 預設 meta |
| `powerhouse/copy/children_post_args` | 10 | Doc\Api | 複製保持 post_type |
| `powerhouse/product/get_meta_keys_array` | 10 | Product\Api | bound_docs_data |
| `powerhouse/user/get_meta_keys_array` | 10 | Doc\Api | granted_docs |

---

## 常用開發 Pattern

### 新增 Doc Meta
1. PHP: `Doc\Api::extend_post_meta_keys()` 中新增 `$meta_keys['my_field']`
2. TypeScript type: `TDocBaseRecord` in `js/src/pages/admin/Docs/List/types/index.ts`
3. Form: `js/src/pages/admin/Docs/Edit/tabs/Description/index.tsx`
4. Query: `queryMeta.variables.meta_keys` in `js/src/pages/admin/Docs/Edit/index.tsx`

### 新增 Admin 頁面
1. 建立元件 `js/src/pages/admin/MyPage/index.tsx`
2. 新增 resource `js/src/resources/index.tsx`
3. 加入 Route `js/src/App1.tsx`

### 新增 REST Endpoint
在繼承 `ApiBase` 的類別中：`$apis` 陣列定義端點，callback 命名 `{method}_{endpoint_snake}_callback`

---

## 快取

| 快取 Key | 清除時機 | 說明 |
|----------|----------|------|
| `power_docs_get_children_posts_html_{top_parent_id}` | `save_post_pd_doc` | 側邊欄 HTML |

`Utils::get_cache_key($post_id, $key)` 生成 key；`CPT::delete_transient()` 用 `PostUtils::get_top_post_id()` 找 root 後清除。

---

## 常用指令

```bash
pnpm install && composer install     # 安裝依賴
pnpm dev                             # Vite dev server (port 5175)
pnpm build                           # Production build
pnpm lint / pnpm lint:fix            # ESLint + phpcbf
vendor/bin/phpcs                     # PHPCS 檢查
vendor/bin/phpstan analyse           # PHPStan 分析
pnpm release:patch                   # 版本發佈
pnpm sync:version                    # 同步 package.json version -> plugin.php
pnpm i18n                           # 生成 .pot 翻譯模板
```

---

## 關鍵檔案快速索引

| 檔案 | 用途 |
|------|------|
| `plugin.php` | 主入口 + required plugins + `Plugin::instance()` |
| `inc/classes/Bootstrap.php` | 子域實例化 + script enqueue + env localization |
| `inc/classes/Domains/Doc/CPT.php` | pd_doc 註冊 + Elementor 支援 + 快取清除 |
| `inc/classes/Domains/Doc/Access.php` | `can_access()` + WC 訂單授權 `grant_access()` |
| `inc/classes/Domains/Doc/Api.php` | 所有 Powerhouse filter 擴展 |
| `inc/classes/Domains/User/Api.php` | 自訂 /users endpoint |
| `inc/templates/single-pd_doc.php` | 模板分派器 |
| `js/src/App1.tsx` | Refine Shell + 路由 |
| `js/src/pages/admin/Docs/Edit/index.tsx` | 知識庫編輯三標籤 |
| `js/src/pages/admin/Docs/Edit/tabs/SortablePosts/index.tsx` | 拖拽章節樹 |
| `js/src/pages/admin/Docs/List/types/index.ts` | 核心 TypeScript 型別 |
| `js/src/hooks/useEnv.tsx` | 型別化環境變數 |
