@ignore @query
Feature: 查詢知識庫詳情

  Background:
    Given 系統中有管理員 "Admin" 已登入且具備 manage_options 權限
    And 系統中有知識庫：
      | id  | name       | status  | need_access | bg_images |
      | 100 | 測試知識庫 | publish | yes         | 501       |
    And 知識庫 100 有以下章節：
      | id  | name   | post_parent | editor       |
      | 101 | 第一章 | 100         | power-editor |
      | 102 | 第二章 | 100         |              |

  Rule: 前置（參數）- id 必須為存在的文章 ID

    Example: 查詢不存在的知識庫時操作失敗
      When 管理員 "Admin" 查詢知識庫 999 的詳情
      Then 操作失敗，錯誤為「文章不存在」

  Rule: 後置（回應）- 應回傳含所有 meta 的完整知識庫資料

    Example: 查詢知識庫詳情回傳完整欄位
      When 管理員 "Admin" 查詢知識庫 100 的詳情，參數如下：
        | with_description | meta_keys                                                                                |
        | true             | ["need_access","bg_images","pd_keywords","pd_keywords_label","unauthorized_redirect_url"] |
      Then 操作成功
      And 回傳應包含以下欄位：
        | 欄位                      |
        | id                        |
        | name                      |
        | description               |
        | need_access               |
        | bg_images                 |
        | pd_keywords               |
        | pd_keywords_label         |
        | unauthorized_redirect_url |

  Rule: 後置（回應）- bg_images 應回傳圖片完整資訊而非僅 ID

    Example: bg_images 回傳含 url 的圖片物件陣列
      When 管理員 "Admin" 查詢知識庫 100 的詳情
      Then 操作成功
      And bg_images 每筆應包含：
        | 欄位   |
        | id     |
        | url    |
        | width  |
        | height |

  Rule: 後置（回應）- 子章節 editor 為空時應預設回傳 power-editor

    Example: editor 為空的章節回傳 power-editor
      When 管理員 "Admin" 查詢知識庫 100 的詳情
      Then 操作成功
      And 章節 102 的 editor 應為「power-editor」
