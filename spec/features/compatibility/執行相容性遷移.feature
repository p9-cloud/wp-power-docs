@ignore @command
Feature: 執行相容性遷移

  Background:
    Given 系統中有知識庫章節：
      | id  | name   | post_parent | has_elementor_data | editor |
      | 101 | 第一章 | 100         | true               |        |
      | 102 | 第二章 | 100         | false              |        |
      | 103 | 第三章 | 100         | true               | elementor |

  Rule: 後置（狀態）- 有 _elementor_data 但無 editor 的章節應設為 elementor

    Example: 有 Elementor 資料的章節自動標記為 elementor
      When WordPress 觸發 upgrader_process_complete
      Then 章節 101 的 editor 應為「elementor」
      And 章節 103 的 editor 應不變（仍為「elementor」）

  Rule: 後置（狀態）- 無 _elementor_data 且無 editor 的章節應設為 power-editor

    Example: 無 Elementor 資料的章節自動標記為 power-editor
      When WordPress 觸發 upgrader_process_complete
      Then 章節 102 的 editor 應為「power-editor」
