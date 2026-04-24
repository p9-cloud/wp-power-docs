@ignore @command
Feature: 開通知識庫權限

  Background:
    Given 系統中有管理員 "Admin" 已登入且具備 manage_options 權限
    And 系統中有用戶：
      | id | display_name |
      | 10 | John Doe     |
      | 20 | Jane Smith   |
    And 系統中有知識庫：
      | id  | name       | need_access |
      | 100 | 付費知識庫 | yes         |

  Rule: 前置（狀態）- 用戶必須具備 manage_options 權限

    Example: 非管理員開通權限時操作失敗
      Given 用戶 "Alice" 已登入但不具備 manage_options 權限
      When 用戶 "Alice" 為用戶 "John Doe" 開通知識庫 100 的權限
      Then 操作失敗，錯誤為「權限不足」

  Rule: 前置（參數）- user_ids 和知識庫 ID 必須提供

    Example: 缺少 user_ids 時操作失敗
      When 管理員 "Admin" 開通知識庫權限，user_ids 為空
      Then 操作失敗，錯誤為「必要參數未提供」

  Rule: 後置（狀態）- 應在 ph_access_itemmeta 寫入權限記錄

    Example: 為單一用戶開通權限後記錄正確
      When 管理員 "Admin" 為用戶 "John Doe" 開通知識庫 100 的權限
      Then 操作成功
      And ph_access_itemmeta 應有記錄：
        | post_id | user_id | meta_key    |
        | 100     | 10      | expire_date |

    Example: 批量為多個用戶開通權限
      When 管理員 "Admin" 為用戶 ["John Doe", "Jane Smith"] 開通知識庫 100 的權限
      Then 操作成功
      And 用戶 "John Doe" 應擁有知識庫 100 的權限
      And 用戶 "Jane Smith" 應擁有知識庫 100 的權限
