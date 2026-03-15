@ignore @query
Feature: 前台檢視知識庫

  Background:
    Given 系統中有知識庫：
      | id  | name         | status  | need_access | unauthorized_redirect_url |
      | 100 | 公開知識庫   | publish | no          |                           |
      | 200 | 付費知識庫   | publish | yes         | https://example.com/buy   |
      | 300 | 草稿知識庫   | draft   | no          |                           |
    And 知識庫 200 有以下章節：
      | id  | name   | post_parent | editor       |
      | 201 | 第一章 | 200         | power-editor |

  Rule: 前置（狀態）- 公開知識庫任何人皆可存取

    Example: 未登入訪客瀏覽公開知識庫時顯示首頁版型
      Given 用戶未登入
      When 用戶訪問 /pd_doc/公開知識庫
      Then 顯示 doc-landing 版型
      And 頁面應包含所有子分類卡片

  Rule: 前置（狀態）- 需授權知識庫的未授權用戶必須被導向跳轉網址

    Example: 未授權已登入用戶訪問付費知識庫時被導向
      Given 用戶 "Alice" 已登入但未擁有知識庫 200 的權限
      When 用戶 "Alice" 訪問 /pd_doc/付費知識庫
      Then 用戶被 302 導向「https://example.com/buy」

    Example: 未登入訪客訪問付費知識庫時被導向
      Given 用戶未登入
      When 用戶訪問 /pd_doc/付費知識庫
      Then 用戶被 302 導向「https://example.com/buy」

  Rule: 前置（狀態）- 管理員必須可存取任何知識庫

    Example: 管理員訪問付費知識庫時正常顯示
      Given 管理員 "Admin" 已登入且具備 manage_options 權限
      When 管理員 "Admin" 訪問 /pd_doc/付費知識庫
      Then 顯示 doc-landing 版型

  Rule: 前置（狀態）- 草稿文章必須僅管理員可存取

    Example: 非管理員訪問草稿知識庫時被導向 404
      Given 用戶 "Alice" 已登入但不具備 manage_options 權限
      When 用戶 "Alice" 訪問 /pd_doc/草稿知識庫
      Then 用戶被 302 導向 site_url('404')

  Rule: 前置（狀態）- 授權未過期的用戶必須可存取付費知識庫

    Example: 授權未過期時正常顯示
      Given 用戶 "Alice" 擁有知識庫 200 的權限，到期日為「2099-12-31」
      When 用戶 "Alice" 訪問 /pd_doc/付費知識庫
      Then 顯示 doc-landing 版型

    Example: 授權已過期時被導向跳轉網址
      Given 用戶 "Alice" 擁有知識庫 200 的權限，到期日為「2020-01-01」
      When 用戶 "Alice" 訪問 /pd_doc/付費知識庫
      Then 用戶被 302 導向「https://example.com/buy」

  Rule: 後置（回應）- 根知識庫應顯示 doc-landing 版型

    Example: 訪問根知識庫頁面顯示首頁版型
      When 用戶訪問知識庫 100 的根頁面
      Then 顯示 doc-landing 版型
      And 頁面應包含 hero 區塊
      And 頁面應包含所有子分類卡片（grid 排列）

  Rule: 後置（回應）- 子章節應顯示 doc-detail 三欄版型

    Example: 訪問子章節顯示三欄佈局
      Given 用戶 "Alice" 擁有知識庫 200 的權限，到期日為「2099-12-31」
      When 用戶 "Alice" 訪問章節 201
      Then 顯示 doc-detail 版型
      And 左側應顯示側邊導航樹（sider）
      And 中間應顯示文章內容含麵包屑和相關文章
      And 右側應顯示目錄大綱（toc）
      And 底部應顯示最近修改時間

  Rule: 後置（回應）- search 查詢參數應觸發搜尋版型

    Example: 帶 search 參數時顯示搜尋結果
      When 用戶訪問 /pd_doc/公開知識庫?search=關鍵字
      Then 顯示 doc-search 版型
      And 頁面應包含搜尋結果列表
      And 搜尋關鍵字「關鍵字」應被高亮標記

  Rule: 後置（回應）- Elementor 模板的知識庫應使用 Elementor 渲染

    Example: 使用 Elementor 模板的知識庫用 the_content 渲染
      Given 知識庫 100 的 editor 為「elementor」
      When 用戶訪問知識庫 100
      Then 使用 Elementor 的 the_content() 渲染頁面
