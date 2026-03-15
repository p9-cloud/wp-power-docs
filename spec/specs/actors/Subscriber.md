# Subscriber

## 描述
已登入的一般 WordPress 用戶（訂閱者/顧客），瀏覽知識庫前台內容。若知識庫設定為需要授權（`need_access=yes`），必須擁有有效的知識庫存取權限（`ph_access_itemmeta` 中 `expire_date` 未過期）才能檢視內容。

## 關鍵屬性
- 已登入 WordPress（`user_id > 0`）
- 不具備 `manage_options` capability
- 透過購買商品或管理員手動開通取得知識庫存取權限
