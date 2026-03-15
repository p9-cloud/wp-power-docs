# Power Docs

> WordPress 最好的知識變現套件 — 輕鬆做出豐富的知識庫頁面，以及輕鬆管理你的知識訂閱客戶

[![Version](https://img.shields.io/badge/version-1.2.7-blue.svg)](plugin.php)
[![PHP](https://img.shields.io/badge/PHP-8.0+-purple.svg)](composer.json)
[![WordPress](https://img.shields.io/badge/WordPress-5.7+-blue.svg)](plugin.php)
[![WooCommerce](https://img.shields.io/badge/WooCommerce-7.6.0+-96588A.svg)](plugin.php)
[![License](https://img.shields.io/badge/license-GPL--2.0-green.svg)](LICENSE)

## 前往 Youtube 查看介紹

[![Power Docs 介紹](https://github.com/user-attachments/assets/781ff7bb-a55a-4a8a-a788-4383b82ee291)](https://www.youtube.com/watch?v=mhBrrqU-zqY)

---

## ✨ 特色功能

1. **知識庫觀看權限** — 設定知識庫是否需要購買才能觀看，無授權用戶自動導向指定頁面
2. **內容/知識變現** — 綁定 WooCommerce 商品或訂閱，訂單完成自動授權，支援到期日設定
3. **豐富後台管理** — React/TypeScript 管理介面，支援拖拉排序章節、批量操作
4. **雙編輯器支援** — 每個章節可選擇 Power Editor (BlockNote) 或 Elementor 編輯
5. **三種版型頁面** — 知識庫首頁 / 文章詳情 / 搜尋結果，含自動目錄 (TOC) 生成
6. **批量管理用戶** — 查詢有授權的用戶，手動新增/移除授權，含到期日管理
7. **豐富主題色** — 基於 DaisyUI `power` 主題，可自訂外觀
8. **Elementor 整合** — 提供知識庫卡片、搜尋框自訂 Widget

---

## 📋 需求

| 需求 | 版本 |
|---|---|
| PHP | 8.0+ |
| WordPress | 5.7+ |
| WooCommerce | 7.6.0+ |
| [Powerhouse](https://github.com/j7-dev/wp-powerhouse) | 3.3.11+ |

---

## 🚀 安裝

### 方法一：從 GitHub Releases 下載

1. 前往 [Releases 頁面](https://github.com/j7-dev/wp-power-docs/releases/latest)
2. 下載 `power-docs.zip`
3. 在 WordPress 後台 → 外掛 → 安裝外掛 → 上傳外掛

### 方法二：從原始碼建置

```bash
# 1. 安裝 PHP 依賴
composer install --no-dev

# 2. 安裝 Node.js 依賴
pnpm install

# 3. 建置前端
pnpm build

# 4. 上傳整個目錄到 wp-content/plugins/power-docs/
```

### 必要步驟
1. 安裝並啟用 **WooCommerce** 外掛
2. 安裝並啟用 **Powerhouse** 外掛 (3.3.11+)
3. 安裝並啟用 **Power Docs** 外掛

---

## 📖 使用方式

### 建立知識庫

1. 前往 **WordPress 後台 → Power Docs**
2. 點擊「新增知識庫」
3. 設定名稱、縮圖、背景圖、是否需要授權
4. 在「文章管理」分頁新增章節和單元（最多 2 層深度）
5. 點擊章節即可在右側編輯內容（支援 BlockNote 富文字編輯器）

### 設定存取權限

1. 在知識庫設定中開啟「購買才能觀看」
2. 設定「未授權跳轉網址」（建議跳轉到商品銷售頁）
3. 前往「知識庫權限綁定」頁面，將 WooCommerce 商品綁定到知識庫
4. 訂單完成後系統自動授權用戶

### 管理用戶授權

1. 前往「學員管理」頁面
2. 可依照已開通的知識庫篩選用戶
3. 手動新增/移除用戶授權，設定到期日

---

## 🏗️ 專案架構

詳見 [ARCHITECTURE.md](./ARCHITECTURE.md)

```
power-docs/
├── plugin.php                  # 外掛入口點
├── inc/
│   ├── classes/                # PHP 原始碼 (PSR-4 自動載入)
│   │   ├── Bootstrap.php       # 初始化所有 domain
│   │   ├── Admin/              # 管理後台頁面
│   │   ├── Domains/
│   │   │   ├── Doc/            # 知識庫核心邏輯 (CPT, Access, API, Templates)
│   │   │   ├── Product/        # WooCommerce 商品整合
│   │   │   ├── User/           # 用戶 API
│   │   │   └── Elementor/      # Elementor Widget
│   │   └── Helper/             # TOC 生成器等工具
│   └── templates/              # PHP 版型
│       └── pages/
│           ├── doc-landing/    # 知識庫首頁版型
│           ├── doc-detail/     # 文章詳情版型 (含側邊欄 + TOC)
│           └── doc-search/     # 搜尋結果版型
└── js/
    └── src/                    # TypeScript/React 原始碼
        ├── main.tsx            # React 掛載入口
        ├── App1.tsx            # Refine.dev 管理後台
        └── pages/admin/        # 管理頁面元件
```

### Custom Post Type

- **Post Type:** `pd_doc`
- **階層結構:** 知識庫 → 章節 → 單元（最多 2 層）
- **版型:** 系統提供預設版型，主題可覆寫 `single-pd_doc.php`

### 存取控制

```
訂單完成
  → 檢查商品是否有綁定知識庫 (bound_docs_data)
  → 寫入 ph_access_itemmeta 資料表 (expire_date)

用戶造訪知識庫
  → 檢查 need_access meta
  → 查詢 ph_access_itemmeta 的到期日
  → 過期或不存在 → 跳轉到 unauthorized_redirect_url
```

---

## 🛠️ 開發

### 環境需求

- PHP 8.0+
- Node.js 18+
- pnpm
- Composer

### 開發設定

```bash
# 安裝依賴
pnpm install

# 安裝 PHP 依賴 (在 power-docs/ 目錄)
composer install

# 啟動前端開發伺服器 (port 5175)
pnpm dev

# 建置生產版本
pnpm build
```

### 開發前端

前端使用 **Vite + kucrut/vite-for-wp** 整合，開發時 WordPress 後台會自動載入 Vite dev server 的模組。

確保 WordPress 的 `WP_ENVIRONMENT_TYPE` 設定為 `'local'` 以啟用開發模式。

### 代碼品質

```bash
# Lint
pnpm lint

# 自動修復
pnpm lint:fix
```

### 版本發布

```bash
# 更新 patch 版本 (1.2.x)
pnpm release:patch

# 更新 minor 版本 (1.x.0)
pnpm release:minor

# 更新 major 版本 (x.0.0)
pnpm release:major

# 只建置不發布
pnpm release:build-only

# 建立 zip 壓縮檔
pnpm zip
```

### 版本同步

```bash
# 同步 package.json 版本到 plugin.php 標頭
pnpm sync:version
```

### 國際化

```bash
# 生成 pot 檔案
pnpm i18n

# 生成並 commit
pnpm i18n:commit
```

---

## 🔌 WordPress Hooks

### 主要 Actions

| Hook | 說明 |
|---|---|
| `woocommerce_order_status_completed` | 訂單完成時自動授權用戶 |
| `admin_bar_menu` (priority 210) | 在管理員工具列新增「編輯知識庫」連結 |
| `save_post_pd_doc` | 儲存文章時清除 transient 快取 |
| `upgrader_process_complete` | 外掛升級後執行相容性遷移 |

### 主要 Filters

| Hook | 說明 |
|---|---|
| `powerhouse/post/get_meta_keys_array` | 為 pd_doc 暴露 `editor`, `bg_images` 等欄位 |
| `powerhouse/product/get_meta_keys_array` | 為商品暴露 `bound_docs_data` 欄位 |
| `powerhouse/user/get_meta_keys_array` | 為用戶暴露 `granted_docs` 欄位 |
| `single_template` | 覆寫 pd_doc 的前端版型 |

### 主題版型覆寫

將 `single-pd_doc.php` 放在主題目錄中，可覆寫預設版型：

```
wp-content/themes/your-theme/single-pd_doc.php
```

---

## 📡 REST API

### 端點

| 方法 | 路徑 | 說明 |
|---|---|---|
| `GET` | `/wp-json/power-docs/v1/users` | 用戶列表（支援依授權知識庫篩選） |

### GET /users 參數

| 參數 | 說明 |
|---|---|
| `posts_per_page` | 每頁筆數（預設 20） |
| `paged` | 頁碼（預設 1） |
| `s` | 搜尋（ID、帳號、Email、暱稱） |
| `granted_docs[]` | 篩選同時擁有指定知識庫授權的用戶 |

---

## 📄 文件

| 文件 | 說明 |
|---|---|
| [README.md](./README.md) | 本文件 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 完整架構說明 |
| [copilot-instructions.md](./copilot-instructions.md) | AI 開發輔助說明（應移至 `.github/copilot-instructions.md`） |

---

## 📝 授權

GPL v2 or later — 詳見 [LICENSE](./LICENSE)
