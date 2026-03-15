---
name: power-docs
description: "Power Docs — WordPress 知識庫變現外掛開發指引。React 18 + Refine.dev 管理介面、巢狀 CPT pd_doc、WooCommerce 存取控制、Elementor Widget、TOC 生成、Bunny CDN 整合。使用 /power-docs 觸發。"
origin: project-analyze
---

# power-docs — 開發指引

> WordPress Plugin，建立可變現的知識庫系統（`pd_doc` CPT）。後台 Refine.dev SPA 管理文章/章節/用戶授權，前台三種模板頁面（首頁/詳情/搜尋）。

## When to Activate

當使用者在此專案中：
- 修改 `inc/classes/**/*.php`（PHP 後端）
- 修改 `js/src/**/*.tsx`（React/Refine.dev 前端）
- 修改 `inc/templates/**/*.php`（前台模板）
- 詢問 Refine.dev、TOC 生成、存取控制、Elementor Widget 相關問題

## 架構概覽

**技術棧：**
- **語言**: PHP 8.0+（`declare(strict_types=1)`）
- **框架**: WordPress 5.7+、WooCommerce 7.6+、Powerhouse 3.3.11+、Elementor（可選）
- **關鍵依賴**: `kucrut/vite-for-wp ^0.8`、`j7-dev/wp-plugin-trait ^0.2`
- **前端**: React 18 + TypeScript + Refine.dev + Ant Design 5 + TailwindCSS 3 + DaisyUI 4（pc- prefix）
- **狀態管理**: TanStack Query 4 + Jotai
- **建置**: Vite 6（@kucrut/vite-for-wp ^0.11，port 5175）
- **路由**: react-router 7（HashRouter）
- **代碼風格**: PHPCS（WordPress-Core）、PHPStan、ESLint + Prettier

## 目錄結構

```
power-docs/
├── plugin.php                                      # 主入口（PluginTrait + SingletonTrait）
├── inc/
│   ├── classes/
│   │   ├── Bootstrap.php                           # 初始化所有子域模組 + env 加密
│   │   ├── Admin/Entry.php                         # 全屏管理頁面渲染器
│   │   ├── Domains/
│   │   │   ├── Doc/
│   │   │   │   ├── Loader.php                      # 子模組實例化
│   │   │   │   ├── CPT.php                         # CPT 'pd_doc' 註冊（POST_TYPE 常數）
│   │   │   │   ├── Api.php                         # Powerhouse REST filter 擴展
│   │   │   │   ├── Access.php                      # 存取控制（can_access + grant_access）
│   │   │   │   ├── Templates.php                   # 模板覆寫 + admin bar
│   │   │   │   └── Utils.php                       # 遞迴側邊欄 HTML + 快取 key
│   │   │   ├── Product/Api.php                     # 商品 bound_docs_data meta 暴露
│   │   │   ├── User/Api.php                        # 自訂 /users endpoint（granted_docs SQL）
│   │   │   └── Elementor/                          # Card + Search Widget
│   │   ├── Helper/TOCGenerator.php                 # DOMDocument 目錄生成器
│   │   ├── Compatibility/Compatibility.php         # 版本升級遷移
│   │   └── Utils/Base.php                          # APP1_SELECTOR 常數
│   └── templates/                                  # 前台 PHP 模板
├── js/src/
│   ├── main.tsx                                    # React 掛載入口
│   ├── App1.tsx                                    # Refine Shell（6 個 dataProvider）
│   ├── resources/index.tsx                         # Refine 資源定義
│   ├── hooks/useEnv.tsx                            # 型別化環境變數 hook
│   ├── pages/admin/                                # 管理頁面
│   ├── components/                                 # 可重用元件
│   ├── types/                                      # TypeScript 型別
│   └── utils/                                      # 工具函式
├── spec/                                           # 專案規格
└── tests/e2e/                                      # Playwright E2E 測試
```

## Refine.dev DataProvider 配置

```typescript
// App1.tsx - 6 個 dataProvider
const dataProviders = {
    default:      dataProvider('/v2/powerhouse'),    // Powerhouse REST API
    'wp-rest':    dataProvider('/wp/v2'),            // WordPress Core REST API
    'wc-rest':    dataProvider('/wc/v3'),            // WooCommerce REST API
    'wc-store':   dataProvider('/wc/store/v1'),      // WC Store API
    'bunny-stream': bunnyProvider,                   // Bunny CDN
    'power-docs': dataProvider(`/${KEBAB}`),         // Power Docs 專屬 API
}
```

## 命名慣例

| 類型 | 慣例 | 範例 |
|------|------|------|
| PHP Namespace | PascalCase | `J7\PowerDocs\Domains\Doc` |
| PHP 類別 | final + PascalCase | `final class CPT` |
| CPT | pd_ 前綴 | `pd_doc` |
| Refine 資源 | kebab-case | `doc-access`、`media-library` |
| CSS 前綴 | pc- (DaisyUI) | `pc-hero`、`pc-card` |
| Hook | useXxx | `useDocSelect`、`useProductsOptions` |
| Text Domain | snake_case | `power_docs` |

## 開發規範

1. 前台模板使用 PHP 純渲染（不用 JavaScript 框架），TOC 透過 PHP DOMDocument 生成
2. 存取控制統一由 `Access.php` 處理，不在模板內直接判斷
3. React 元件使用 Functional Components + Hooks + memo，禁用 Class Components
4. Data fetching 統一使用 Refine.dev hooks（`useList`/`useOne`/`useUpdate`/`useForm`/`useTable`）
5. 環境變數透過 `useEnv()` hook（from `@/hooks`）存取，不直接操作 `window` 物件
6. Form 提交前必須用 `toFormData()` from `antd-toolkit` 轉換
7. 所有 PHP 類別使用 SingletonTrait，禁止 `new ClassName()`

## 常用指令

```bash
composer install           # 安裝 PHP 依賴
pnpm install               # 安裝 Node 依賴
pnpm dev                   # Vite 開發伺服器 (port 5175)
pnpm build                 # 建置到 js/dist/
pnpm lint / pnpm lint:fix  # ESLint + phpcbf
vendor/bin/phpcs           # PHP 代碼風格檢查
vendor/bin/phpstan analyse # PHPStan 靜態分析
pnpm release:patch         # 發佈 patch 版本
pnpm sync:version          # 同步版本號
```

## 相關 SKILL

- `wordpress-coding-standards` — WordPress 程式碼標準
- `react-coding-standards` — React 前端開發標準
- `refine` — Refine.dev 框架使用指引
- `wp-rest-api` — REST API 設計規範
- `wp-plugin-development` — WordPress Plugin 開發指引
