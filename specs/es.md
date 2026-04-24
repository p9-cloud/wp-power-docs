# Event Storming: Power Docs

> WordPress 知識變現套件 -- 知識庫管理、章節排序、購買授權、存取控制、Elementor 整合
> **版本:** 1.2.10 | **文件日期:** 2026-03-12

---

## Actors

- **Admin** [人]: WordPress 管理員，管理知識庫內容、章節結構、商品綁定、用戶授權
- **Subscriber** [人]: 已登入的一般用戶/訂閱者，瀏覽知識庫內容
- **Guest** [人]: 未登入的訪客，瀏覽公開知識庫
- **WooCommerce** [外部系統]: 訂單完成時觸發知識庫授權
- **WordPress** [系統]: 外掛升級時觸發相容性遷移；儲存文章時清除快取

---

## Aggregates

### Doc（知識庫文章）

> CPT `pd_doc`，階層結構：知識庫(root) -> 章節(depth=1) -> 單元(depth=2)

| 屬性 | 說明 |
|------|------|
| `ID` | 文章 ID（WP post ID） |
| `post_title` | 標題 |
| `post_content` | 內容（HTML） |
| `post_status` | 狀態：publish / draft / pending / private |
| `post_parent` | 父文章 ID（0 表示根知識庫） |
| `menu_order` | 排序順序 |
| `post_type` | 固定為 `pd_doc` |
| meta: `editor` | 編輯器類型：`power-editor` / `elementor` / `''`（空字串=知識庫首頁預設版型） |
| meta: `bg_images` | 背景圖片 attachment ID（僅根知識庫） |
| meta: `need_access` | 是否需要購買授權：`yes` / `no`（僅根知識庫） |
| meta: `pd_keywords` | 搜尋關鍵字陣列 `[{id, title}]`（僅根知識庫） |
| meta: `pd_keywords_label` | 關鍵字標籤文字（僅根知識庫） |
| meta: `unauthorized_redirect_url` | 未授權跳轉網址（僅根知識庫） |

### Product（WooCommerce 商品）

> WooCommerce 商品，透過 `bound_docs_data` meta 綁定知識庫授權

| 屬性 | 說明 |
|------|------|
| `ID` | 商品 ID |
| `name` | 商品名稱 |
| `type` | 商品類型：simple / variable / subscription / ... |
| `status` | 商品狀態 |
| meta: `bound_docs_data` | 綁定的知識庫授權資料陣列，每筆包含 `{id, limit_type, limit_value, limit_unit}` |
| `children` | 商品變體（僅可變商品） |

### UserAccess（用戶存取權限）

> 存於 Powerhouse 的 `wp_ph_access_itemmeta` 資料表

| 屬性 | 說明 |
|------|------|
| `post_id` | 知識庫根文章 ID |
| `user_id` | 用戶 ID |
| `meta_key` | 固定為 `expire_date` |
| `meta_value` | 到期日期字串（空字串或日期格式，空 = 永久） |

### User（用戶）

> WordPress 用戶，擴充 `granted_docs` 虛擬欄位

| 屬性 | 說明 |
|------|------|
| `ID` | 用戶 ID |
| `user_login` | 帳號 |
| `user_email` | 電子信箱 |
| `display_name` | 顯示名稱 |
| `user_nicename` | 別名 |
| virtual: `granted_docs` | 已授權的知識庫清單（由 `ph_access_itemmeta` 即時計算），每筆包含 `{id, name, expire_date}` |

---

## Commands

### CreateDoc（建立知識庫/章節）

- **Actor**: Admin
- **Aggregate**: Doc
- **Predecessors**: 無
- **參數**: `name` (string), `post_type` (pd_doc), `post_parent?` (int), `status?` (string)
- **Feature**: `features/doc/建立知識庫.feature`
- **Endpoint**: `POST /posts`
- **Description**:
  - **What**: 透過 Powerhouse REST API 建立知識庫或章節
  - **Why**: 管理員需要建立新的知識庫或在知識庫下新增章節/單元
  - **When**: 管理員在後台點擊「新增知識庫」或「新增文章」

#### Rules

- 前置（狀態）: 用戶必須具備 manage_options 權限
- 前置（參數）: name 和 post_type 必須提供
- 後置（狀態）: 若為根知識庫（無 post_parent），自動建立預設 meta：pd_keywords_label、pd_keywords、unauthorized_redirect_url
- 後置（狀態）: 若為子章節（有 post_parent），editor 預設為 power-editor

### UpdateDoc（更新知識庫/章節）

- **Actor**: Admin
- **Aggregate**: Doc
- **Predecessors**: 知識庫/章節已存在
- **參數**: `id` (int), `name?`, `post_content?`, `slug?`, `status?`, `need_access?`, `bg_images?` (file/delete), `pd_keywords?`, `pd_keywords_label?`, `unauthorized_redirect_url?`, `editor?`
- **Feature**: `features/doc/更新知識庫.feature`
- **Endpoint**: `PATCH /posts/{id}`
- **Description**:
  - **What**: 透過 Powerhouse REST API 更新知識庫或章節
  - **Why**: 管理員需要編輯知識庫內容、設定存取權限、上傳背景圖等
  - **When**: 管理員在編輯頁面點擊儲存

#### Rules

- 前置（狀態）: 用戶必須具備 manage_options 權限
- 前置（狀態）: 文章必須存在
- 前置（參數）: id 必須為有效的文章 ID
- 後置（狀態）: 若 bg_images 為檔案，上傳並儲存 attachment ID
- 後置（狀態）: 若 bg_images 為 delete，清除背景圖 meta
- 後置（狀態）: 儲存時清除對應知識庫的 transient 快取
- 後置（狀態）: 若 editor 切換為 power-editor，清除所有 _elementor_ 開頭的 meta

### DeleteDoc（刪除知識庫/章節）

- **Actor**: Admin
- **Aggregate**: Doc
- **Predecessors**: 知識庫/章節已存在
- **參數**: `ids` (int[])
- **Feature**: `features/doc/刪除知識庫.feature`
- **Endpoint**: `DELETE /posts/{id}`
- **Description**:
  - **What**: 透過 Powerhouse REST API 刪除知識庫或章節，支援批量
  - **Why**: 管理員需要移除不需要的知識庫或章節
  - **When**: 管理員在後台點擊刪除或批量刪除

#### Rules

- 前置（狀態）: 用戶必須具備 manage_options 權限
- 前置（狀態）: 文章必須存在
- 前置（參數）: ids 必須為有效的文章 ID 陣列
- 後置（狀態）: 文章被刪除且快取被清除

### CopyDoc（複製知識庫）

- **Actor**: Admin
- **Aggregate**: Doc
- **Predecessors**: 知識庫已存在
- **參數**: `post_id` (int)
- **Feature**: `features/doc/複製知識庫.feature`
- **Endpoint**: `POST /copy/{id}`
- **Description**:
  - **What**: 透過 Powerhouse REST API 複製知識庫及其所有子章節
  - **Why**: 管理員需要基於現有知識庫快速建立新的知識庫
  - **When**: 管理員在列表頁面點擊複製

#### Rules

- 前置（狀態）: 用戶必須具備 manage_options 權限
- 前置（參數）: post_id 必須為存在的知識庫 ID
- 後置（狀態）: 複製的知識庫及所有子章節的 post_type 保持為 pd_doc

### SortPosts（排序章節）

- **Actor**: Admin
- **Aggregate**: Doc
- **Predecessors**: 知識庫已存在且有子章節
- **參數**: `from_tree` (SortTreeNode[]), `to_tree` (SortTreeNode[])
- **Feature**: `features/doc/排序章節.feature`
- **Endpoint**: `POST /posts/sort`
- **Description**:
  - **What**: 透過 Powerhouse REST API 更新章節排序和父子關係
  - **Why**: 管理員需要透過拖拉調整章節順序和階層
  - **When**: 管理員在文章管理分頁拖拉排序後自動觸發

#### Rules

- 前置（狀態）: 用戶必須具備 manage_options 權限
- 前置（參數）: from_tree 和 to_tree 必須提供
- 前置（參數）: 最大深度不超過 2 層
- 前置（參數）: from_tree 和 to_tree 不得相同
- 後置（狀態）: 受影響章節的 menu_order 和 post_parent 更新

### BindDocsToProducts（綁定知識庫到商品）

- **Actor**: Admin
- **Aggregate**: Product
- **Predecessors**: 商品和知識庫都已存在
- **參數**: `product_ids` (string[]), `item_ids` (string[]), `meta_key` = bound_docs_data, `limit_type`, `limit_value?`, `limit_unit?`
- **Feature**: `features/product/綁定知識庫到商品.feature`
- **Endpoint**: `POST /products/bind-items`
- **Description**:
  - **What**: 透過 Powerhouse REST API 將知識庫授權資料寫入商品的 bound_docs_data meta
  - **Why**: 需要設定購買哪個商品能獲得哪些知識庫的存取權限
  - **When**: 管理員在「知識庫權限綁定」頁面操作

#### Rules

- 前置（狀態）: 用戶必須具備 manage_options 權限
- 前置（參數）: product_ids 和 item_ids 必須提供
- 前置（參數）: follow_subscription 限定訂閱類型商品
- 後置（狀態）: 商品的 bound_docs_data meta 更新

### UnbindDocsFromProducts（解除商品知識庫綁定）

- **Actor**: Admin
- **Aggregate**: Product
- **Predecessors**: 商品已綁定知識庫
- **參數**: `product_ids` (string[]), `item_ids` (string[]), `meta_key` = bound_docs_data
- **Feature**: `features/product/解除商品知識庫綁定.feature`
- **Endpoint**: `POST /products/unbind-items`
- **Description**:
  - **What**: 移除商品 bound_docs_data 中指定的知識庫綁定
  - **Why**: 需要解除商品與知識庫的授權關聯
  - **When**: 管理員在「知識庫權限綁定」頁面操作解除綁定

#### Rules

- 前置（狀態）: 用戶必須具備 manage_options 權限
- 前置（參數）: product_ids 和 item_ids 必須提供
- 後置（狀態）: 商品的 bound_docs_data 中移除指定的知識庫

### UpdateBoundDocsSettings（更新商品知識庫綁定設定）

- **Actor**: Admin
- **Aggregate**: Product
- **Predecessors**: 商品已綁定知識庫
- **參數**: `product_ids` (string[]), `item_ids` (string[]), `meta_key` = bound_docs_data, `limit_type`, `limit_value?`, `limit_unit?`
- **Feature**: `features/product/更新商品知識庫綁定設定.feature`
- **Endpoint**: `POST /products/update-bound-items`
- **Description**:
  - **What**: 更新商品已綁定知識庫的期限設定
  - **Why**: 需要調整已綁定知識庫的期限或類型設定
  - **When**: 管理員在「知識庫權限綁定」頁面修改已綁定項目的設定

#### Rules

- 前置（狀態）: 用戶必須具備 manage_options 權限
- 前置（參數）: product_ids 和 item_ids 必須提供
- 後置（狀態）: 指定項目的 limit 設定更新

### GrantAccessOnOrderCompleted（訂單完成自動授權）

- **Actor**: WooCommerce（系統觸發）
- **Aggregate**: UserAccess, Product
- **Predecessors**: 顧客完成 WooCommerce 訂單
- **參數**: `order_id` (int)
- **Feature**: `features/product/訂單完成自動授權.feature`
- **Endpoint**: (WooCommerce hook，非 REST API)
- **Description**:
  - **What**: 訂單完成時，檢查訂單商品的 bound_docs_data，自動將知識庫授權寫入 ph_access_itemmeta
  - **Why**: 實現購買知識庫的自動授權流程
  - **When**: `woocommerce_order_status_completed` hook 觸發

#### Rules

- 前置（狀態）: 訂單必須存在且為有效 WC_Order
- 前置（狀態）: 訂單必須有登入用戶（customer_id 不為 0）
- 前置（狀態）: 訂單商品必須有 bound_docs_data meta
- 後置（狀態）: 對每個綁定知識庫呼叫 grant_user 寫入權限

### GrantUsers（開通知識庫權限）

- **Actor**: Admin
- **Aggregate**: UserAccess
- **Predecessors**: 用戶和知識庫都已存在
- **參數**: `user_ids` (string[]), `item_ids` (string[]), `expire_date` (unix timestamp, 0=永久)
- **Feature**: `features/user/開通知識庫權限.feature`
- **Endpoint**: `POST /limit/grant-users`
- **Description**:
  - **What**: 透過 Powerhouse REST API 為用戶手動開通知識庫存取權限
  - **Why**: 管理員需要不經由購買流程直接為特定用戶開通權限
  - **When**: 管理員在「學員管理」頁面操作

#### Rules

- 前置（狀態）: 用戶必須具備 manage_options 權限
- 前置（參數）: user_ids 和 item_ids 必須提供
- 後置（狀態）: ph_access_itemmeta 中寫入權限記錄

### RevokeUsers（撤銷知識庫權限）

- **Actor**: Admin
- **Aggregate**: UserAccess
- **Predecessors**: 用戶已擁有知識庫權限
- **參數**: `user_ids` (string[]), `item_ids` (string[])
- **Feature**: `features/user/撤銷知識庫權限.feature`
- **Endpoint**: `POST /limit/revoke-users`
- **Description**:
  - **What**: 透過 Powerhouse REST API 撤銷用戶的知識庫存取權限
  - **Why**: 管理員需要移除特定用戶的存取權限
  - **When**: 管理員在「學員管理」頁面操作

#### Rules

- 前置（狀態）: 用戶必須具備 manage_options 權限
- 前置（參數）: user_ids 和 item_ids 必須提供
- 後置（狀態）: 移除 ph_access_itemmeta 中的權限記錄

### UpdateGrantedUsers（更新用戶知識庫期限）

- **Actor**: Admin
- **Aggregate**: UserAccess
- **Predecessors**: 用戶已擁有知識庫權限
- **參數**: `user_ids` (string[]), `item_ids` (string[]), `timestamp` (unix timestamp, 0=永久)
- **Feature**: `features/user/更新用戶知識庫期限.feature`
- **Endpoint**: `POST /limit/update-users`
- **Description**:
  - **What**: 透過 Powerhouse REST API 更新用戶的知識庫到期日
  - **Why**: 管理員需要延長或縮短用戶的存取期限
  - **When**: 管理員在「學員管理」頁面操作

#### Rules

- 前置（狀態）: 用戶必須具備 manage_options 權限
- 前置（參數）: user_ids 和 item_ids 必須提供
- 後置（狀態）: ph_access_itemmeta 中的 expire_date 更新

### RunCompatibilityMigration（執行相容性遷移）

- **Actor**: WordPress（系統觸發）
- **Aggregate**: Doc
- **Predecessors**: 外掛升級完成
- **參數**: 無
- **Feature**: `features/compatibility/執行相容性遷移.feature`
- **Endpoint**: (WordPress hook，非 REST API)
- **Description**:
  - **What**: 為所有缺少 editor meta 的章節自動設定：有 _elementor_data 的設為 elementor，其餘設為 power-editor
  - **Why**: 確保舊版本升級後，所有章節都有正確的編輯器類型設定
  - **When**: `upgrader_process_complete` hook 觸發

#### Rules

- 後置（狀態）: 所有有 _elementor_data 但無 editor 的章節設為 editor=elementor
- 後置（狀態）: 所有無 _elementor_data 且無 editor 的章節設為 editor=power-editor

---

## Read Models

### GetDocs（查詢知識庫列表）

- **Actor**: Admin
- **Aggregates**: Doc
- **回傳欄位**: `id`, `name`, `slug`, `status`, `need_access`, `permalink`, `images`
- **Feature**: `features/doc/查詢知識庫列表.feature`
- **Endpoint**: `GET /posts`
- **Description**:
  - **What**: 透過 Powerhouse REST API 查詢知識庫列表（post_type=pd_doc，根層級）
  - **Why**: 管理員需要瀏覽和管理所有知識庫
  - **When**: 管理員進入知識庫列表頁面

#### Rules

- 前置（參數）: post_type 必須為 pd_doc
- 後置（回應）: 僅回傳根層級的知識庫文章
- 後置（回應）: 包含分頁資訊 Header（X-WP-Total, X-WP-TotalPages）

### GetDocDetail（查詢知識庫詳情）

- **Actor**: Admin
- **Aggregates**: Doc
- **回傳欄位**: 同 GetDocs 加上 `description`, `need_access`, `bg_images`, `pd_keywords`, `pd_keywords_label`, `unauthorized_redirect_url`, `children`
- **Feature**: `features/doc/查詢知識庫詳情.feature`
- **Endpoint**: `GET /posts/{id}`
- **Description**:
  - **What**: 透過 Powerhouse REST API 查詢知識庫詳情含所有 meta
  - **Why**: 管理員編輯知識庫時需要完整資料
  - **When**: 管理員進入知識庫編輯頁面

#### Rules

- 前置（參數）: id 必須為存在的文章 ID
- 後置（回應）: 回傳含所有 meta 的完整知識庫資料
- 後置（回應）: bg_images 回傳圖片完整資訊（id, url, width, height）
- 後置（回應）: 子章節 editor 為空時預設回傳 power-editor

### ViewDocFrontend（前台檢視知識庫）

- **Actor**: Subscriber / Guest / Admin
- **Aggregates**: Doc, UserAccess
- **回傳欄位**: HTML 頁面（landing / detail / search）
- **Feature**: `features/doc/前台檢視知識庫.feature`
- **Endpoint**: (前台 template 路由，非 REST API)
- **Description**:
  - **What**: 訪問 `/pd_doc/{slug}`，系統根據文章層級和查詢參數渲染對應版型
  - **Why**: 用戶需要瀏覽知識庫內容
  - **When**: 用戶訪問知識庫前台頁面

#### Rules

- 前置（狀態）: 公開知識庫任何人皆可存取
- 前置（狀態）: 需授權知識庫的未授權用戶必須被導向跳轉網址
- 前置（狀態）: 管理員必須可存取任何知識庫
- 前置（狀態）: 草稿文章僅管理員可存取
- 前置（狀態）: 授權未過期的用戶可存取付費知識庫；已過期則導向跳轉網址
- 後置（回應）: 根知識庫顯示 doc-landing 版型
- 後置（回應）: 子章節顯示 doc-detail 三欄版型（sider + main + toc）
- 後置（回應）: search 查詢參數觸發 doc-search 搜尋版型
- 後置（回應）: Elementor 模板的知識庫使用 Elementor 渲染

### GetProducts（查詢商品列表）

- **Actor**: Admin
- **Aggregates**: Product
- **回傳欄位**: 商品基本資料 + `bound_docs_data` + `children`（變體）
- **Feature**: `features/product/查詢商品列表.feature`
- **Endpoint**: `GET /products`
- **Description**:
  - **What**: 透過 Powerhouse REST API 查詢商品列表含知識庫綁定資料
  - **Why**: 管理員在「知識庫權限綁定」頁面需要查看商品及其已綁定的知識庫
  - **When**: 管理員進入「知識庫權限綁定」頁面

#### Rules

- 前置（參數）: meta_keys 必須包含 bound_docs_data
- 後置（回應）: 每個商品包含 bound_docs_data 陣列
- 後置（回應）: 可變商品包含 children 變體子商品

### GetUsers（查詢用戶列表）

- **Actor**: Admin
- **Aggregates**: User, UserAccess
- **回傳欄位**: `id`, `user_login`, `user_email`, `display_name`, `user_nicename`, `granted_docs`
- **Feature**: `features/user/查詢用戶列表.feature`
- **Endpoint**: `GET /users`（Power Docs 自訂 endpoint）
- **Description**:
  - **What**: 查詢用戶列表，支援搜尋、分頁，及依已授權知識庫篩選
  - **Why**: 管理員需要查看和管理知識庫授權的用戶
  - **When**: 管理員進入「學員管理」頁面

#### Rules

- 前置（參數）: posts_per_page 預設 20，paged 預設 1
- 前置（參數）: 搜尋欄位支援 ID、user_login、user_email、user_nicename、display_name
- 前置（參數）: granted_docs 篩選同時擁有所有指定知識庫的用戶（AND 邏輯）
- 後置（回應）: Response Header 包含分頁資訊（X-WP-Total, X-WP-TotalPages, X-WP-CurrentPage, X-WP-PageSize）
- 後置（回應）: 回傳 granted_docs 虛擬欄位（id, name, expire_date）
