@ignore @command
Feature: 複製知識庫

  Background:
    Given 系統中有管理員 "Admin" 已登入且具備 manage_options 權限
    And 系統中有知識庫：
      | id  | name       | status  |
      | 100 | 測試知識庫 | publish |
    And 知識庫 100 有以下章節：
      | id  | name   | post_parent | menu_order |
      | 101 | 第一章 | 100         | 1          |
      | 102 | 第二章 | 100         | 2          |

  Rule: 前置（狀態）- 用戶必須具備 manage_options 權限

    Example: 非管理員複製知識庫時操作失敗
      Given 用戶 "Alice" 已登入但不具備 manage_options 權限
      When 用戶 "Alice" 複製知識庫 100
      Then 操作失敗，錯誤為「權限不足」

  Rule: 前置（參數）- post_id 必須為存在的知識庫 ID

    Example: 複製不存在的知識庫時操作失敗
      When 管理員 "Admin" 複製知識庫 999
      Then 操作失敗，錯誤為「文章不存在」

  Rule: 後置（狀態）- 複製的知識庫及所有子章節的 post_type 應為 pd_doc

    Example: 成功複製知識庫及子章節後 post_type 正確
      When 管理員 "Admin" 複製知識庫 100
      Then 操作成功
      And 新知識庫的 post_type 應為「pd_doc」
      And 新知識庫應有 2 個子章節
      And 所有子章節的 post_type 應為「pd_doc」
