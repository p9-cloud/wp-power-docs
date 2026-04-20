@ignore @command
Feature: 知識庫章節拖拽排序

  知識庫管理員在知識庫編輯頁（`#/docs/edit/:id`）的章節管理分頁中，
  透過拖拽調整章節（`pd_doc` 子文章）在樹狀結構中的位置與順序。
  拖拽完成後前端呼叫 POST `/posts/sort`（body: `{ from_tree, to_tree }`），
  後端必須將最新的樹狀結構持久化至 `wp_posts` 資料表，
  重新載入頁面後樹狀結構與拖拽結果必須一致。

  # CiC(AMB): 目前已知結果不一致，根因層級待查證——
  # 可能在 power-docs 本地 (`js/src/pages/admin/Docs/Edit/tabs/SortablePosts/index.tsx`
  # 的 from_tree / to_tree 組裝、isEqual 比對、invalidate 時機)，
  # 也可能在 Powerhouse 共用層 (`CRUD::sort_posts`) 的寫入邏輯。
  # Dev 階段第一步須執行 SQL SELECT 驗證 `wp_posts.menu_order` 與 `post_parent`
  # 是否如實被寫入，再決定修復層級（power-docs local override 或直接修 Powerhouse）。

  Background:
    Given 系統中存在以下 pd_doc 知識庫根節點：
      | id  | post_title | post_parent | menu_order |
      | 100 | 知識庫 A   | 0           | 0          |
    And 系統中存在以下 pd_doc 章節節點（`post_parent = 100`）：
      | id  | post_title | post_parent | menu_order |
      | 101 | 章節一     | 100         | 0          |
      | 102 | 章節二     | 100         | 1          |
      | 103 | 章節三     | 100         | 2          |
    And 系統中存在以下 pd_doc 單元節點：
      | id  | post_title | post_parent | menu_order |
      | 201 | 單元 1-1   | 101         | 0          |
      | 202 | 單元 1-2   | 101         | 1          |
      | 203 | 單元 2-1   | 102         | 0          |
    And 使用者以「可管理 pd_doc」的管理員身份登入

  Rule: 拖拽排序操作完成後，前端樹狀結構應即時反映最新順序

    Example: 同層級重排—章節一從第 1 位拖到第 3 位後，樹狀結構依新順序呈現
      Given 使用者位於知識庫 A 的章節管理分頁，樹狀結構顯示為「章節一、章節二、章節三」
      When 使用者將「章節一」拖拽至「章節三」之後
      Then 操作成功
      And 樹狀結構依序呈現為「章節二、章節三、章節一」
      And 頁面重新載入後，樹狀結構仍依序呈現為「章節二、章節三、章節一」

    Example: 跨層級移動—單元 2-1 從章節二拖到章節一之下後，樹狀結構反映新父節點
      Given 使用者位於知識庫 A 的章節管理分頁，「單元 2-1」位於「章節二」之下
      When 使用者將「單元 2-1」拖拽至「章節一」之下，作為「章節一」的第 3 個子節點
      Then 操作成功
      And 「單元 2-1」在樹狀結構中呈現為「章節一」的子節點
      And 「章節二」之下不再呈現「單元 2-1」
      And 頁面重新載入後，「單元 2-1」仍呈現為「章節一」的子節點

  Rule: 拖拽排序操作完成後，後端應將最新樹狀結構完整持久化至 `wp_posts`

    Example: 同層級重排後，受影響章節的 menu_order 與 post_modified 被更新
      Given 系統中 pd_doc 章節節點的 `menu_order` 依序為「章節一=0、章節二=1、章節三=2」
      When 使用者將「章節一」拖拽至「章節三」之後
      Then 操作成功
      And `wp_posts` 表中應呈現下列狀態：
        | id  | post_parent | menu_order |
        | 101 | 100         | 2          |
        | 102 | 100         | 0          |
        | 103 | 100         | 1          |
      And id = 101、102、103 的 `post_modified` 欄位應被更新為本次操作時間

    Example: 跨層級移動後，移動節點的 post_parent 與 menu_order 同步更新
      Given 「單元 2-1」的 `post_parent = 102` 且 `menu_order = 0`
      And 「章節一」之下的既有單元為「單元 1-1 (menu_order=0)」與「單元 1-2 (menu_order=1)」
      When 使用者將「單元 2-1」拖拽至「章節一」之下的第 3 個位置
      Then 操作成功
      And `wp_posts` 表中 id = 203 的資料應為：
        | post_parent | menu_order |
        | 101         | 2          |
      And id = 203 的 `post_modified` 欄位應被更新為本次操作時間
      And 原章節二（id = 102）之下不再存在 `post_parent = 102` 的記錄（除自身以外的子節點關係）
