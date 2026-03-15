@ignore @command
Feature: 排序章節

  Background:
    Given 系統中有管理員 "Admin" 已登入且具備 manage_options 權限
    And 系統中有知識庫 100
    And 知識庫 100 有以下章節：
      | id  | name     | post_parent | menu_order |
      | 101 | 第一章   | 100         | 1          |
      | 102 | 第二章   | 100         | 2          |
      | 103 | 單元 1-1 | 101         | 1          |

  Rule: 前置（狀態）- 用戶必須具備 manage_options 權限

    Example: 非管理員排序章節時操作失敗
      Given 用戶 "Alice" 已登入但不具備 manage_options 權限
      When 用戶 "Alice" 排序知識庫 100 的章節
      Then 操作失敗，錯誤為「權限不足」

  Rule: 前置（參數）- from_tree 和 to_tree 必須提供

    Example: 缺少 to_tree 時操作失敗
      When 管理員 "Admin" 排序章節，僅提供 from_tree 未提供 to_tree
      Then 操作失敗，錯誤為「必要參數未提供」

  Rule: 前置（參數）- 最大深度必須不超過 2 層

    Example: 超過最大深度時前端阻止操作
      When 管理員 "Admin" 嘗試將章節 103 拖入深度超過 2 的位置
      Then 前端顯示「超過最大深度，無法執行」
      And 系統不送出排序 API 請求

  Rule: 前置（參數）- from_tree 和 to_tree 不得相同

    Example: 排序結果無變化時不送出請求
      When 管理員 "Admin" 拖拉章節但最終位置未改變
      Then 系統不送出排序 API 請求

  Rule: 後置（狀態）- 受影響章節的 menu_order 和 post_parent 應更新

    Example: 交換章節順序後 menu_order 正確
      When 管理員 "Admin" 將章節 102 排到章節 101 之前
      Then 操作成功
      And 章節排序應為：
        | id  | post_parent | menu_order |
        | 102 | 100         | 1          |
        | 101 | 100         | 2          |
        | 103 | 101         | 1          |

    Example: 移動章節到其他章節下後 post_parent 更新
      When 管理員 "Admin" 將章節 102 拖入章節 101 下成為子章節
      Then 操作成功
      And 章節 102 的 post_parent 應為 101
