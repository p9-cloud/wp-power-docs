# `.github/` 目錄架構（Power Docs）

> Power Docs WordPress 知識庫外掛的 CI-driven AI Agent Pipeline。
> **核心哲學**：透過 workflow 層級串接多個 agent（clarifier → planner → tdd-coordinator → browser-tester），agent 之間以 Git commit、GitHub Issue comment、step outputs 為橋樑。
> **範本來源**：`wp-content/plugins/power-course/.github/`（完整版，含 LC bypass），本外掛已移除不適用部分。

---

## 一、目錄結構

```
.github/
├── workflows/
│   ├── pipe.yml           # 主 pipeline（claude job + integration-tests job）
│   ├── pipe.md            # pipeline 中文規格書
│   ├── issue.yml          # Issue 需求展開（@claude 展開/探討/dev 觸發）
│   └── act-test.yml       # 本機 act 結構驗證用（不發布）
├── actions/
│   └── claude-retry/      # claude-code-action@v1 的 3 次重試包裝（30s / 60s backoff）
│       └── action.yml
├── prompts/               # AI agent prompt 模板（{{ISSUE_NUM}} placeholder）
│   ├── clarifier-interactive.md   # 互動澄清（第一輪至少 5 題）
│   ├── clarifier-pipeline.md      # pipeline 模式（直接生成 specs）
│   ├── planner.md                 # 規劃實作計畫
│   └── tdd-coordinator.md         # TDD 實作循環
├── templates/             # Issue/PR comment 模板
│   ├── pipeline-upgrade-comment.md
│   ├── test-result-comment.md     # PHPUnit 結果留言
│   └── acceptance-comment.md      # AI 驗收報告留言
├── scripts/
│   └── upload-to-bunny.sh # Bunny CDN 媒體上傳（截圖 / 影片）
└── instruction.md         # 本文件
```

---

## 二、Power Docs 專屬設定

### WordPress 環境

| 項目 | 值 |
|------|------|
| Plugin slug | `power-docs` |
| Text domain | `power_docs` |
| PHP namespace | `J7\PowerDocs` |
| PHP 版本 | 8.0+ |
| wp-env port（開發） | `8895` |
| wp-env testsPort | `8893` |
| Admin SPA URL | `http://localhost:8893/wp-admin/admin.php?page=power-docs#/` |
| `wp-env run --env-cwd` | `wp-content/plugins/power-docs` |
| 前端建置 | `pnpm run build`（單一步驟，無 `build:wp`） |

### 與 Power Course 範本的差異

| 項目 | Power Course（範本） | Power Docs（本外掛） |
|------|--------------------|---------------------|
| LC Bypass | ✅ 修改 `plugin.php` 注入 `'lc' => false` | ❌ 已移除（`plugin.php` 無 `'capability'` 行） |
| `.wp-env.json` mappings | ✅ `wp-content/plugins/wp-power-course` | ❌ 無 mappings，路徑為 `wp-content/plugins/power-docs` |
| 前端建置 | `pnpm run build && pnpm run build:wp` | `pnpm run build`（單步驟） |
| AI 驗收路徑 | `js/src/` / `inc/templates/` / `inc/assets/` / `inc/classes/` | `js/src/` / `inc/templates/` / `inc/classes/` |
| SPA 路由 | `#/courses`、`#/teachers`、`#/students`、... | `#/docs`、`#/users`、`#/doc-access`、`#/media-library`、`#/bunny-media-library` |
| 前台模板 | 課程頁面 | `doc-landing` / `doc-detail` / `doc-search` |

---

## 三、核心設計模式

### 3.1 Two-Job Pipeline

- **Job 1 `claude`**（180 min）：專注 AI 創作 — clarifier → planner → tdd-coordinator
- **Job 2 `integration-tests`**（150 min）：自動化驗證 — PHPUnit 3 循環 → AI 驗收 → 自動 PR
- Job 2 透過 `needs: claude` + `if` 條件按需啟動

### 3.2 三循環測試修復

```
test_cycle_1 (失敗) → claude_fix_1 → test_cycle_2 (失敗) → claude_fix_2 → test_cycle_3 (最終)
```

所有步驟 `continue-on-error: true`，最終 `final_result` step 判定整體成敗。

### 3.3 `claude-retry` Composite Action

- 3 次嘗試，失敗時 sleep 30s / 60s backoff
- `outputs.success`：任一嘗試成功即 true
- 用於高可靠性 agent（clarifier / planner / tdd）
- 容錯性高的步驟（測試修復、smoke 驗收）直接用 `anthropics/claude-code-action@v1`

---

## 四、Secrets 清單

| Secret | 用途 |
|--------|------|
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Code Action 授權（必備） |
| `GITHUB_TOKEN` | Actions 預設，寫入 comment/PR |
| `BUNNY_STORAGE_HOST` | Bunny CDN 儲存域名 |
| `BUNNY_STORAGE_ZONE` | Bunny CDN 區域名 |
| `BUNNY_STORAGE_PASSWORD` | Bunny CDN access key |
| `BUNNY_CDN_URL` | Bunny CDN 公開 URL（回寫留言） |

---

## 五、Docker / wp-env 防雷要點

（範本實踐，本 pipe.yml 已內建）

1. **wp-env start 3 次重試** + delays `15/45/90s` + unhealthy 容器 restart（避免 `tests-mysql` 初始化競態）
2. **uploads 目錄**：wp-env start 前 `sudo rm -rf ./tests/e2e/.uploads && mkdir -p && chmod 777`（避免 Docker 以 root 建立）
3. **Composer 主機端安裝**：`composer install --no-interaction --prefer-dist` 先在 runner 跑，避免 wp-env 容器內失敗
4. **`set -o pipefail` + `tee`**：測試輸出雙向保存（終端 + `/tmp/phpunit_output.txt`）
5. **`wp-env run tests-cli --env-cwd=wp-content/plugins/power-docs`**：`--env-cwd` 必須與 `.wp-env.json` 的實際容器路徑對齊
6. **強制 git HTTPS**：`git config --global url."https://github.com/".insteadOf "git@github.com:"`（避免 plugin 安裝時 SSH 失敗）
7. **fetch-depth**：Job 1 用 `0`（完整歷史，供 SHA 比對）；Job 2 用 `50`（夠用又省時）
8. **Playwright**：`npx playwright install chromium --with-deps`（裝瀏覽器 + OS 依賴）
9. **CJK 字型**：`sudo apt-get install -y fonts-noto-cjk`（繁中內容截圖不變豆腐）

---

## 六、開發者工作流

### 觸發 CI

在 Issue 或 PR 留言：

```
@claude                   # 僅澄清需求
@claude 開工              # clarifier → planner → tdd
@claude 全自動            # 全流程 + 測試 + AI 驗收 + PR
@claude PR                # 跳過實作，直接測試 + AI 驗收 + PR
@claude 展開              # issue.yml 展開粗略需求為完整規格
@claude 展開 dev          # DEV 模式（面向工程師）
```

### 本機驗證 Workflow 結構

```powershell
mkdir -p "$env:TEMP/act-artifacts"
act workflow_dispatch -W .github/workflows/act-test.yml `
  --container-architecture linux/amd64 `
  -P ubuntu-latest=catthehacker/ubuntu:act-latest `
  --container-options "--privileged" `
  --artifact-server-path "C:/Users/$env:USERNAME/AppData/Local/Temp/act-artifacts"
```

---

## 七、延伸閱讀

- 完整版範本（含 LC bypass）：`wp-content/plugins/power-course/.github/instruction.md`
- Pipeline 規格書：本目錄 `workflows/pipe.md`
- 外掛業務邏輯：`power-docs/.claude/CLAUDE.md`
