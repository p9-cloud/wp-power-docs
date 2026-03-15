# Admin

## 描述
WordPress 管理員，擁有 `manage_options` 權限。負責管理知識庫內容、章節結構、商品綁定、用戶授權。透過 Power Docs 後台管理介面操作（React + Refine.dev SPA，掛載於 WordPress admin 頁面 `admin.php?page=power-docs`）。

## 關鍵屬性
- 必須為 WordPress 登入用戶
- 必須具備 `manage_options` capability
- 透過 WordPress REST API nonce 認證
