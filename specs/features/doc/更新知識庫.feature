@ignore @command
Feature: 更新知識庫

  Background:
    Given 系統中有管理員 "Admin" 已登入且具備 manage_options 權限
    And 系統中有知識庫：
      | id  | name       | status  | need_access | editor |
      | 100 | 測試知識庫 | publish | no          |        |

  Rule: 前置（狀態）- 用戶必須具備 manage_options 權限

    Example: 非管理員更新知識庫時操作失敗
      Given 用戶 "Alice" 已登入但不具備 manage_options 權限
      When 用戶 "Alice" 更新知識庫 100
      Then 操作失敗，錯誤為「權限不足」

  Rule: 前置（狀態）- 文章必須存在

    Example: 更新不存在的知識庫時操作失敗
      When 管理員 "Admin" 更新知識庫 999
      Then 操作失敗，錯誤為「文章不存在」

  Rule: 前置（參數）- id 必須為有效的文章 ID

    Example: id 為非數字時操作失敗
      When 管理員 "Admin" 更新知識庫 "abc"
      Then 操作失敗，錯誤為「無效的文章 ID」

  Rule: 後置（狀態）- 上傳 bg_images 檔案時應儲存 attachment ID

    Example: 上傳背景圖後 meta 更新為 attachment ID
      When 管理員 "Admin" 更新知識庫 100，上傳 bg_images 檔案 "background.jpg"
      Then 操作成功
      And 知識庫 100 的 bg_images meta 應為上傳圖片的 attachment ID

  Rule: 後置（狀態）- bg_images 為 delete 時應清除背景圖 meta

    Example: 刪除背景圖後 meta 為空
      Given 知識庫 100 的 bg_images 為 attachment ID 501
      When 管理員 "Admin" 更新知識庫 100，bg_images 為「delete」
      Then 操作成功
      And 知識庫 100 的 bg_images meta 應為空字串

  Rule: 後置（狀態）- 儲存時應清除對應知識庫的 transient 快取

    Example: 更新知識庫後快取被清除
      When 管理員 "Admin" 更新知識庫 100 的 name 為「新名稱」
      Then 操作成功
      And transient「power_docs_get_children_posts_html_100」應被刪除

  Rule: 後置（狀態）- editor 切換為 power-editor 時應清除所有 Elementor meta

    Example: 切換為 power-editor 後 Elementor meta 被清除
      Given 知識庫 100 的章節：
        | id  | name   | editor    |
        | 101 | 第一章 | elementor |
      And 章節 101 有 meta「_elementor_data」和「_elementor_css」
      When 管理員 "Admin" 更新章節 101 的 editor 為「power-editor」
      Then 操作成功
      And 章節 101 不應有任何以「_elementor_」開頭的 meta
