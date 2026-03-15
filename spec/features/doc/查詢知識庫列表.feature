@ignore @query
Feature: 查詢知識庫列表

  Background:
    Given 系統中有管理員 "Admin" 已登入且具備 manage_options 權限
    And 系統中有知識庫：
      | id  | name         | status  | need_access |
      | 100 | 公開知識庫   | publish | no          |
      | 101 | 付費知識庫   | publish | yes         |
      | 102 | 草稿知識庫   | draft   | no          |

  Rule: 前置（參數）- post_type 必須為 pd_doc

    Example: 未指定 post_type 時操作失敗
      When 管理員 "Admin" 查詢知識庫列表，未指定 post_type
      Then 操作失敗，錯誤為「必要參數未提供」

  Rule: 後置（回應）- 應僅回傳根層級的知識庫文章

    Example: 查詢知識庫列表回傳根層級文章
      When 管理員 "Admin" 查詢知識庫列表，參數如下：
        | post_type | meta_keys       |
        | pd_doc    | ["need_access"] |
      Then 操作成功
      And 回傳 3 筆知識庫
      And 每筆應包含：
        | 欄位        |
        | id          |
        | name        |
        | slug        |
        | status      |
        | need_access |
        | permalink   |
        | images      |

  Rule: 後置（回應）- 應包含分頁資訊 Header

    Example: 分頁查詢回傳正確的分頁 Header
      When 管理員 "Admin" 查詢知識庫列表，每頁 2 筆，第 1 頁
      Then 操作成功
      And 回傳 2 筆知識庫
      And Response Header 應為：
        | header           | value |
        | X-WP-Total       | 3     |
        | X-WP-TotalPages  | 2     |
