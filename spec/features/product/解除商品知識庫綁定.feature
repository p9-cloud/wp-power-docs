@ignore @command
Feature: 解除商品知識庫綁定

  Background:
    Given 系統中有管理員 "Admin" 已登入且具備 manage_options 權限
    And 系統中有商品：
      | id | name     | type   |
      | 10 | 基礎方案 | simple |
    And 商品 10 的 bound_docs_data 為：
      | id  | limit_type |
      | 100 | unlimited  |

  Rule: 前置（狀態）- 用戶必須具備 manage_options 權限

    Example: 非管理員解除綁定時操作失敗
      Given 用戶 "Alice" 已登入但不具備 manage_options 權限
      When 用戶 "Alice" 解除商品 10 與知識庫 100 的綁定
      Then 操作失敗，錯誤為「權限不足」

  Rule: 前置（參數）- product_ids 和 item_ids 必須提供

    Example: 缺少 item_ids 時操作失敗
      When 管理員 "Admin" 解除商品綁定，product_ids 為 [10]，item_ids 為空
      Then 操作失敗，錯誤為「必要參數未提供」

  Rule: 後置（狀態）- 商品的 bound_docs_data 應移除指定知識庫

    Example: 成功解除綁定後 bound_docs_data 不包含該知識庫
      When 管理員 "Admin" 解除商品 10 與知識庫 100 的綁定
      Then 操作成功
      And 商品 10 的 bound_docs_data 不應包含知識庫 100

    Example: 批量解除多個商品的綁定
      Given 商品 20 也綁定了知識庫 100
      When 管理員 "Admin" 解除商品 [10, 20] 與知識庫 100 的綁定
      Then 操作成功
      And 商品 10 的 bound_docs_data 不應包含知識庫 100
      And 商品 20 的 bound_docs_data 不應包含知識庫 100
