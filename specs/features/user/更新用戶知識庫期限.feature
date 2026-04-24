@ignore @command
Feature: 更新用戶知識庫期限

  Background:
    Given 系統中有管理員 "Admin" 已登入且具備 manage_options 權限
    And 系統中有用戶：
      | id | display_name |
      | 10 | John Doe     |
    And 用戶 "John Doe" 擁有知識庫 100 的權限，到期日為「2025-12-31」

  Rule: 前置（狀態）- 用戶必須具備 manage_options 權限

    Example: 非管理員更新期限時操作失敗
      Given 用戶 "Alice" 已登入但不具備 manage_options 權限
      When 用戶 "Alice" 更新用戶 "John Doe" 的知識庫 100 期限
      Then 操作失敗，錯誤為「權限不足」

  Rule: 前置（參數）- user_ids 和 item_ids 必須提供

    Example: 缺少必要參數時操作失敗
      When 管理員 "Admin" 更新知識庫期限，user_ids 為空
      Then 操作失敗，錯誤為「必要參數未提供」

  Rule: 後置（狀態）- ph_access_itemmeta 中的 expire_date 應更新

    Example: 延長期限後到期日正確
      When 管理員 "Admin" 更新用戶 "John Doe" 的知識庫 100 期限為「2026-12-31」
      Then 操作成功
      And 用戶 "John Doe" 的知識庫 100 到期日應為「2026-12-31」

    Example: 批量更新多個用戶的期限
      Given 用戶 "Jane Smith" (id=20) 也擁有知識庫 100 的權限
      When 管理員 "Admin" 更新用戶 ["John Doe", "Jane Smith"] 的知識庫 100 期限為「2026-12-31」
      Then 操作成功
      And 用戶 "John Doe" 的知識庫 100 到期日應為「2026-12-31」
      And 用戶 "Jane Smith" 的知識庫 100 到期日應為「2026-12-31」
