@ignore @command
Feature: 綁定知識庫到商品

  Background:
    Given 系統中有管理員 "Admin" 已登入且具備 manage_options 權限
    And 系統中有商品：
      | id | name     | type         |
      | 10 | 基礎方案 | simple       |
      | 20 | 訂閱方案 | subscription |
    And 系統中有知識庫：
      | id  | name       | need_access |
      | 100 | 付費知識庫 | yes         |

  Rule: 前置（狀態）- 用戶必須具備 manage_options 權限

    Example: 非管理員綁定知識庫時操作失敗
      Given 用戶 "Alice" 已登入但不具備 manage_options 權限
      When 用戶 "Alice" 綁定知識庫 100 到商品 10
      Then 操作失敗，錯誤為「權限不足」

  Rule: 前置（參數）- product_ids 和 item_ids 必須提供

    Scenario Outline: 缺少 <缺少參數> 時操作失敗
      When 管理員 "Admin" 綁定知識庫到商品，參數如下：
        | product_ids   | item_ids   | meta_key        |
        | <product_ids> | <item_ids> | bound_docs_data |
      Then 操作失敗，錯誤為「必要參數未提供」

      Examples:
        | 缺少參數    | product_ids | item_ids |
        | product_ids |             | [100]    |
        | item_ids    | [10]        |          |

  Rule: 前置（參數）- follow_subscription 限定訂閱類型商品

    Example: 非訂閱商品使用 follow_subscription 時前端禁用 checkbox
      When 管理員 "Admin" 設定 limit_type 為「follow_subscription」
      Then 商品 10（simple 類型）的 checkbox 應為 disabled 狀態

  Rule: 後置（狀態）- 商品的 bound_docs_data meta 應更新

    Example: 成功綁定知識庫到商品
      When 管理員 "Admin" 綁定知識庫 100 到商品 10，參數如下：
        | meta_key        | limit_type | limit_value | limit_unit |
        | bound_docs_data | fixed      | 365         | day        |
      Then 操作成功
      And 商品 10 的 bound_docs_data 應包含：
        | id  | limit_type | limit_value | limit_unit |
        | 100 | fixed      | 365         | day        |

    Example: 批量綁定到多個商品
      When 管理員 "Admin" 綁定知識庫 100 到商品 [10, 20]，limit_type 為「unlimited」
      Then 操作成功
      And 商品 10 的 bound_docs_data 應包含知識庫 100
      And 商品 20 的 bound_docs_data 應包含知識庫 100
