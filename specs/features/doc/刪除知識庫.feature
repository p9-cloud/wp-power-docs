@ignore @command
Feature: 刪除知識庫

  Background:
    Given 系統中有管理員 "Admin" 已登入且具備 manage_options 權限
    And 系統中有知識庫：
      | id  | name       | status  |
      | 100 | 測試知識庫 | publish |

  Rule: 前置（狀態）- 用戶必須具備 manage_options 權限

    Example: 非管理員刪除知識庫時操作失敗
      Given 用戶 "Alice" 已登入但不具備 manage_options 權限
      When 用戶 "Alice" 刪除知識庫 100
      Then 操作失敗，錯誤為「權限不足」

  Rule: 前置（狀態）- 文章必須存在

    Example: 刪除不存在的知識庫時操作失敗
      When 管理員 "Admin" 刪除知識庫 999
      Then 操作失敗，錯誤為「文章不存在」

  Rule: 前置（參數）- ids 必須為有效的文章 ID 陣列

    Example: 空 ids 陣列時操作失敗
      When 管理員 "Admin" 批量刪除知識庫 []
      Then 操作失敗，錯誤為「必要參數未提供」

  Rule: 後置（狀態）- 文章應被刪除且快取應清除

    Example: 成功刪除單一知識庫
      When 管理員 "Admin" 刪除知識庫 100
      Then 操作成功
      And 知識庫 100 不應存在

    Example: 批量刪除多個知識庫後均不存在
      Given 系統中還有知識庫：
        | id  | name       |
        | 101 | 知識庫二   |
        | 102 | 知識庫三   |
      When 管理員 "Admin" 批量刪除知識庫 [100, 101, 102]
      Then 操作成功
      And 知識庫 100、101、102 均不應存在
