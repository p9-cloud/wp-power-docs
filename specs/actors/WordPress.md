# WordPress

## 描述
WordPress 核心系統，作為系統觸發器。在外掛升級完成時透過 `upgrader_process_complete` hook 觸發相容性遷移；在文章儲存時透過 `save_post_pd_doc` hook 清除快取和處理 Elementor 資料。

## 關鍵屬性
- 系統觸發（非人工操作）
- 觸發時機：外掛升級完成、文章儲存
