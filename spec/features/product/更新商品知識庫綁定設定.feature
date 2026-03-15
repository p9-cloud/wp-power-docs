@ignore @command
Feature: 更新商品知識庫綁定設定

  Background:
    Given 系統中有管理員 "Admin" 已登入且具備 manage_options 權限
    And 系統中有商品：
      | id | name     | type   |
      | 10 | 基礎方案 | simple |
    And 商品 10 的 bound_docs_data 為：
      | id  | limit_type |
      | 100 | unlimited  |

  Rule: 前置（狀態）- 用戶必須具備 manage_options 權限

    Example: 非管理員更新綁定設定時操作失敗
      Given 用戶 "Alice" 已登入但不具備 manage_options 權限
      When 用戶 "Alice" 更新商品 10 的知識庫綁定設定
      Then 操作失敗，錯誤為「權限不足」

  Rule: 前置（參數）- product_ids 和 item_ids 必須提供

    Example: 缺少必要參數時操作失敗
      When 管理員 "Admin" 更新商品綁定設定，product_ids 為空
      Then 操作失敗，錯誤為「必要參數未提供」

  Rule: 後置（狀態）- 指定項目的 limit 設定應更新

    Example: 將期限從永久改為固定天數後設定正確
      When 管理員 "Admin" 更新商品 10 的知識庫 100 綁定設定：
        | limit_type | limit_value | limit_unit |
        | fixed      | 90          | day        |
      Then 操作成功
      And 商品 10 的 bound_docs_data 中知識庫 100 的設定應為：
        | limit_type | limit_value | limit_unit |
        | fixed      | 90          | day        |
