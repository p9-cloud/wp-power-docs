---
globs:
  - ".wp-env.json"
  - ".env"
  - ".gitignore"
  - "release/**"
  - ".github/**"
---

# Development Workflow & Setup

## 環境需求

| 工具 | 版本 | 檢查 |
|------|------|------|
| PHP | 8.0+ | `php -v` |
| Composer | latest | `composer -V` |
| Node.js | 18+ | `node -v` |
| pnpm | 10+ | `pnpm -v` |
| WordPress | 5.7+ | — |
| WooCommerce | 7.6.0+ | — |
| Powerhouse | 3.3.11+ | — |

## 初始化

```bash
pnpm install
composer install
# 啟用 WooCommerce -> Powerhouse -> Power Docs
```

## 本地開發

在 `wp-config.php` 設定：
```php
define('WP_ENVIRONMENT_TYPE', 'local'); // 啟用 CPT 選單可見
define('WP_DEBUG', true);
define('WP_DEBUG_LOG', true);
```

開發流程：
```bash
pnpm dev            # Vite dev server at localhost:5175
# 訪問 wp-admin/admin.php?page=power-docs
# React HMR 自動重載，PHP 需手動刷新
```

## 程式碼品質

```bash
pnpm lint           # ESLint check
pnpm lint:fix       # ESLint auto-fix + phpcbf
vendor/bin/phpcs    # PHPCS (WordPress-Core)
vendor/bin/phpcbf   # PHPCS auto-fix
vendor/bin/phpstan analyse  # PHPStan
```

設定檔：`.eslintrc.cjs`, `.prettierrc`, `phpcs.xml`, `phpstan.neon`

## 發佈流程

```bash
pnpm release:patch  # bump + build + git tag + GitHub Release
pnpm release:minor
pnpm release:major
pnpm release:build-only  # 只 build 不發佈
pnpm zip            # 建立 release/power-docs.zip
pnpm sync:version   # 同步 package.json version -> plugin.php header
```

## i18n

- Text Domain: `power_docs`
- PHP: `\esc_html__('Text', 'power_docs')`
- 生成 .pot: `pnpm i18n`

## Debug

| 方法 | 用途 |
|------|------|
| `\J7\WpUtils\Classes\WC::log($msg, $ctx)` | WooCommerce log（WC -> Status -> Logs） |
| `\error_log()` | wp-content/debug.log |
| React Query DevTools | 開發模式右下角 |
| Network tab | 檢查 REST API 呼叫 |

## 常見問題

| 問題 | 解法 |
|------|------|
| Admin panel 空白 | 檢查 console 錯誤、確認 Vite dev server 執行中 |
| REST 401 | 確認 nonce 透過 AXIOS_INSTANCE 發送 |
| 模板不載入 | 前往 Settings -> Permalinks 刷新 rewrite rules |
| pd_doc 不可見 | 設定 `WP_ENVIRONMENT_TYPE=local` |
| Elementor Widget 不見 | 確認 Elementor 已啟用 |
| 存取權限未授予 | 檢查 `ph_access_itemmeta` 表及商品 `bound_docs_data` |
