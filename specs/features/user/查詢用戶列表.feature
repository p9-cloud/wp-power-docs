@ignore @query
Feature: 查詢用戶列表

  Background:
    Given 系統中有管理員 "Admin" 已登入且具備 manage_options 權限
    And 系統中有用戶：
      | id | user_login | user_email       | display_name |
      | 10 | john       | john@example.com | John Doe     |
      | 20 | jane       | jane@example.com | Jane Smith   |
    And 用戶 "John Doe" 擁有知識庫 100 的權限
    And 用戶 "Jane Smith" 擁有知識庫 100 和 200 的權限

  Rule: 前置（參數）- posts_per_page 預設為 20，paged 預設為 1

    Example: 預設分頁查詢回傳正確 Header
      When 管理員 "Admin" 查詢用戶列表
      Then 操作成功
      And Response Header 應包含：
        | header            | description |
        | X-WP-Total        | 總筆數      |
        | X-WP-TotalPages   | 總頁數      |
        | X-WP-CurrentPage  | 目前頁碼    |
        | X-WP-PageSize     | 每頁筆數    |

  Rule: 前置（參數）- 搜尋欄位必須支援 ID、user_login、user_email、user_nicename、display_name

    Example: 以 Email 搜尋用戶回傳正確結果
      When 管理員 "Admin" 搜尋用戶，關鍵字為「john@example.com」
      Then 操作成功
      And 回傳 1 筆用戶
      And 用戶為 "John Doe"

    Example: 以 display_name 搜尋用戶回傳正確結果
      When 管理員 "Admin" 搜尋用戶，關鍵字為「Doe」
      Then 操作成功
      And 回傳 1 筆用戶
      And 用戶為 "John Doe"

  Rule: 前置（參數）- granted_docs 應篩選同時擁有所有指定知識庫的用戶

    Example: 篩選擁有單一知識庫權限的用戶
      When 管理員 "Admin" 查詢用戶列表，granted_docs 為 [100]
      Then 操作成功
      And 回傳 2 筆用戶

    Example: 篩選同時擁有多個知識庫權限的用戶
      When 管理員 "Admin" 查詢用戶列表，granted_docs 為 [100, 200]
      Then 操作成功
      And 回傳 1 筆用戶
      And 用戶為 "Jane Smith"

  Rule: 後置（回應）- 應回傳 granted_docs 虛擬欄位

    Example: 用戶回傳含已授權知識庫清單
      When 管理員 "Admin" 查詢用戶列表，meta_keys 包含「granted_docs」
      Then 操作成功
      And 用戶 "John Doe" 的 granted_docs 應包含知識庫 100
      And 每筆 granted_doc 應包含：
        | 欄位        |
        | id          |
        | name        |
        | expire_date |
