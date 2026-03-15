# WooCommerce

## 描述
WooCommerce 電商系統，作為外部系統觸發器。當訂單狀態變更為 `completed` 時，透過 `woocommerce_order_status_completed` hook 觸發知識庫自動授權流程。

## 關鍵屬性
- 系統觸發（非人工操作）
- 觸發時機：訂單狀態 -> completed
- 依賴 WooCommerce 7.6.0+ 版本
