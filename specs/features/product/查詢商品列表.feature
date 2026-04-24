@ignore @query
Feature: 查詢商品列表

  Background:
    Given 系統中有管理員 "Admin" 已登入且具備 manage_options 權限
    And 系統中有商品：
      | id | name     | type             | status  |
      | 10 | 基礎方案 | simple           | publish |
      | 20 | 進階方案 | variable         | publish |
      | 30 | 訂閱方案 | subscription     | publish |
    And 商品 10 的 bound_docs_data 為：
      | id  | limit_type |
      | 100 | unlimited  |
    And 商品 20 的 bound_docs_data 為空陣列
    And 商品 30 的 bound_docs_data 為：
      | id  | limit_type         |
      | 200 | follow_subscription |

  Rule: 前置（參數）- meta_keys 必須包含 bound_docs_data

    Example: 未指定 meta_keys 時不回傳 bound_docs_data 欄位
      When 管理員 "Admin" 查詢商品列表，未帶 meta_keys 參數
      Then 操作成功
      And 回傳的商品不包含 bound_docs_data 欄位

  Rule: 後置（回應）- 每個商品應包含 bound_docs_data 陣列

    Example: 查詢商品列表回傳含 bound_docs_data
      When 管理員 "Admin" 查詢商品列表，meta_keys 為 ["bound_docs_data"]
      Then 操作成功
      And 回傳 3 筆商品
      And 商品 10 的 bound_docs_data 應包含 1 筆知識庫綁定
      And 商品 20 的 bound_docs_data 應為空陣列

  Rule: 後置（回應）- 可變商品應包含變體子商品

    Example: 可變商品回傳 children 變體
      When 管理員 "Admin" 查詢商品列表
      Then 操作成功
      And 商品 20 的 children 應包含變體商品
      And 每個變體應包含各自的 bound_docs_data
