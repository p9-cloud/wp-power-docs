# Guest

## 描述
未登入的訪客，僅能瀏覽不需要授權的公開知識庫（`need_access=no` 或空值）。若知識庫需要授權，會被導向 `unauthorized_redirect_url`。

## 關鍵屬性
- 未登入（`user_id = 0`）
- 僅能存取公開知識庫
- 無法擁有知識庫存取權限
