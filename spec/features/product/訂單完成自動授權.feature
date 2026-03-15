@ignore @command
Feature: 訂單完成自動授權

  Background:
    Given 系統中有商品：
      | id | name     | type   |
      | 10 | 基礎方案 | simple |
    And 商品 10 的 bound_docs_data 為：
      | id  | limit_type | limit_value | limit_unit |
      | 100 | fixed      | 365         | day        |
    And 系統中有知識庫：
      | id  | name       | need_access |
      | 100 | 付費知識庫 | yes         |

  Rule: 前置（狀態）- 訂單必須存在且為有效 WC_Order

    Example: 無效訂單 ID 時不執行授權
      When WooCommerce 觸發 woocommerce_order_status_completed，order_id 為 99999
      Then 系統不執行任何授權操作

  Rule: 前置（狀態）- 訂單必須有登入用戶

    Example: 訪客訂單時不執行授權
      Given 訂單 500 的 customer_id 為 0
      And 訂單 500 包含商品 10
      When WooCommerce 觸發 order_status_completed，order_id 為 500
      Then 系統不執行任何授權操作

  Rule: 前置（狀態）- 訂單商品必須有 bound_docs_data meta

    Example: 商品未綁定知識庫時跳過
      Given 訂單 501 包含商品 20（bound_docs_data 為空）
      And 訂單 501 的 customer_id 為用戶 "Alice" (id=10)
      When WooCommerce 觸發 order_status_completed，order_id 為 501
      Then 系統不執行任何授權操作

  Rule: 後置（狀態）- 應對每個綁定知識庫呼叫 grant_user 寫入權限

    Example: 訂單完成後自動授權知識庫
      Given 訂單 502 包含商品 10
      And 訂單 502 的 customer_id 為用戶 "Alice" (id=10)
      When WooCommerce 觸發 order_status_completed，order_id 為 502
      Then 用戶 "Alice" 應獲得知識庫 100 的存取權限
      And ph_access_itemmeta 應新增記錄：
        | post_id | user_id | meta_key    | meta_value   |
        | 100     | 10      | expire_date | 365 天後日期 |

    Example: 訂單包含多個綁定知識庫商品時全部授權
      Given 商品 30 的 bound_docs_data 為：
        | id  | limit_type |
        | 200 | unlimited  |
      And 訂單 503 包含商品 10 和商品 30
      And 訂單 503 的 customer_id 為用戶 "Alice" (id=10)
      When WooCommerce 觸發 order_status_completed，order_id 為 503
      Then 用戶 "Alice" 應獲得知識庫 100 的存取權限（365 天）
      And 用戶 "Alice" 應獲得知識庫 200 的存取權限（永久）
