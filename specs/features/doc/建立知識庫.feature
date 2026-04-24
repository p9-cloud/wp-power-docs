@ignore @command
Feature: 建立知識庫

  Background:
    Given 系統中有管理員 "Admin" 已登入且具備 manage_options 權限

  Rule: 前置（狀態）- 用戶必須具備 manage_options 權限

    Example: 非管理員建立知識庫時操作失敗
      Given 用戶 "Alice" 已登入但不具備 manage_options 權限
      When 用戶 "Alice" 建立知識庫，參數如下：
        | name     | post_type |
        | 新知識庫 | pd_doc    |
      Then 操作失敗，錯誤為「權限不足」

  Rule: 前置（參數）- 必要參數必須提供

    Scenario Outline: 缺少 <缺少參數> 時操作失敗
      When 管理員 "Admin" 建立知識庫，參數如下：
        | name   | post_type   |
        | <name> | <post_type> |
      Then 操作失敗，錯誤為「必要參數未提供」

      Examples:
        | 缺少參數  | name     | post_type |
        | name      |          | pd_doc    |
        | post_type | 新知識庫 |           |

  Rule: 後置（狀態）- 根知識庫應自動建立預設 meta

    Example: 建立根知識庫後預設 meta 自動設定
      When 管理員 "Admin" 建立知識庫，參數如下：
        | name     | post_type |
        | 新知識庫 | pd_doc    |
      Then 操作成功
      And 知識庫的 meta 應為：
        | meta_key                  | meta_value                                     |
        | pd_keywords_label         | 大家都在搜：                                    |
        | unauthorized_redirect_url | site_url('404')                                 |
      And 知識庫的 pd_keywords 應包含 1 筆預設關鍵字

  Rule: 後置（狀態）- 子章節的 editor 應預設為 power-editor

    Example: 在知識庫下新增章節後 editor 為 power-editor
      Given 系統中有知識庫：
        | id  | name       |
        | 100 | 測試知識庫 |
      When 管理員 "Admin" 在知識庫 100 下建立章節，參數如下：
        | name   | post_type | post_parent |
        | 第一章 | pd_doc    | 100         |
      Then 操作成功
      And 章節的 editor 應為「power-editor」
