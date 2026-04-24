@ignore @command
Feature: 撤銷知識庫權限

  Background:
    Given 系統中有管理員 "Admin" 已登入且具備 manage_options 權限
    And 系統中有用戶：
      | id | display_name |
      | 10 | John Doe     |
    And 用戶 "John Doe" 擁有知識庫 100 的權限

  Rule: 前置（狀態）- 用戶必須具備 manage_options 權限

    Example: 非管理員撤銷權限時操作失敗
      Given 用戶 "Alice" 已登入但不具備 manage_options 權限
      When 用戶 "Alice" 撤銷用戶 "John Doe" 的知識庫 100 權限
      Then 操作失敗，錯誤為「權限不足」

  Rule: 前置（參數）- user_ids 和 item_ids 必須提供

    Example: 缺少 item_ids 時操作失敗
      When 管理員 "Admin" 撤銷權限，user_ids 為 [10]，item_ids 為空
      Then 操作失敗，錯誤為「必要參數未提供」

  Rule: 後置（狀態）- 應移除 ph_access_itemmeta 中的權限記錄

    Example: 撤銷後用戶不再擁有權限
      When 管理員 "Admin" 撤銷用戶 "John Doe" 的知識庫 100 權限
      Then 操作成功
      And 用戶 "John Doe" 不應擁有知識庫 100 的權限

    Example: 批量撤銷多個用戶的權限
      Given 用戶 "Jane Smith" (id=20) 也擁有知識庫 100 的權限
      When 管理員 "Admin" 撤銷用戶 ["John Doe", "Jane Smith"] 的知識庫 100 權限
      Then 操作成功
      And 用戶 "John Doe" 不應擁有知識庫 100 的權限
      And 用戶 "Jane Smith" 不應擁有知識庫 100 的權限
