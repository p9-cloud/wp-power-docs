---
globs:
  - "js/src/**"
  - "vite.config.ts"
  - "tailwind.config.cjs"
  - "tsconfig.json"
  - "package.json"
  - ".eslintrc.cjs"
  - ".prettierrc"
---

# Frontend Development Rules

## Path Alias

```typescript
'@/*' → 'js/src/*'  // tsconfig.json + vite.config.ts
```

## 環境變數

- PHP 加密 -> `window.power_docs_data.env` -> 前端 `simpleDecrypt()` 解密
- **元件內**: 使用 `useEnv()` from `@/hooks`（不要直接用 `antd-toolkit` 的）
- **元件外**: 使用 `env`, `API_URL`, `APP1_SELECTOR`, `DOCS_POST_TYPE` from `@/utils`

## Refine.dev 使用規範

### Data Fetching
```typescript
// 列表
useTable<TDocBaseRecord>({ resource: 'posts', filters: { permanent: objToCrudFilters({ post_type: DOCS_POST_TYPE }) } })

// 編輯
useForm<TDocRecord>({ action: 'edit', resource: 'posts', id, queryMeta: { variables: { meta_keys: [...] } } })

// 建立
useCreate() -> mutate({ resource: 'posts', values: { name, post_type: DOCS_POST_TYPE } })

// 自訂 API
useCustomMutation() -> mutate({ url: `${apiUrl}/posts/sort`, method: 'post', values: {...} })
```

### Form 提交
- **必須** 使用 `toFormData()` from `antd-toolkit` 轉換後再呼叫 `onFinish()`
- 處理空陣列序列化為 `'[]'`、FileList -> FormData

## 元件規範

- **必須** 使用 `React.memo()` 包裹，named export
- Jotai atom 定義在同目錄 `atom.tsx`
- Functional Components + Hooks，禁止 Class Components
- 泛型明確標註：`useForm<TDocRecord, HttpError, Partial<TDocRecord>>()`

## 樣式規範

### TailwindCSS
- 作用域：`important: '#tw'` — 必須在 `id="tw"` 容器內
- **禁用的 class**（與 WordPress 衝突）：`hidden`, `fixed`, `block`, `inline`, `columns-1`, `columns-2`
- **替代 class**：`tw-hidden`, `tw-fixed`, `tw-block`, `tw-inline`, `tw-columns-1`, `tw-columns-2`

### DaisyUI
- 前綴 `pc-`：`pc-btn`, `pc-divider`, `pc-toc`
- 主題 `power`：primary `#377cfb`, secondary `#66cc8a`, accent `#f68067`
- 動畫已停用（避免 Elementor 衝突）

### 響應式斷點
| 名稱 | 寬度 | 裝置 |
|------|------|------|
| sm | 576px | iPhone SE |
| md | 810px | iPad Portrait |
| lg | 1080px | iPad Landscape |
| xl | 1280px | MacBook Air |
| xxl | 1440px | — |

## 核心型別

```typescript
// js/src/pages/admin/Docs/List/types/index.ts
type TDocBaseRecord = {
  id: string; depth: number; name: string; slug: string;
  status: TPostStatus; menu_order: number; permalink: string;
  images: TImage[]; parent_id: string; bg_images: TImage[];
  editor: 'power-editor' | 'elementor';
  need_access: 'yes' | 'no' | '';
  pd_keywords: string[]; pd_keywords_label: string;
  unauthorized_redirect_url: string;
  // ...dates, terms
}
type TDocRecord = TDocBaseRecord & TLimit & { description: string; short_description: string; children?: TDocRecord[] }
```

## 常用 `antd-toolkit` 匯入

```typescript
// antd-toolkit
import { toFormData, Heading, Switch, CopyText, BlockNoteDrawer, DescriptionDrawer,
  PopconfirmDelete, cn, useRowSelection, getDefaultPaginationProps, objToCrudFilters,
  FilterTags, notificationProps, simpleDecrypt } from 'antd-toolkit'

// antd-toolkit/wp
import { FileUpload, useItemSelect } from 'antd-toolkit/wp'

// antd-toolkit/refine
import { dataProvider, notificationProvider, useBunny, MediaLibraryNotification } from 'antd-toolkit/refine'
```

## SortablePosts 注意事項

- `MAX_DEPTH = 2`（由 `sortableRule` callback 強制）
- 排序後 POST `/posts/sort` { from_tree, to_tree }，lodash `isEqual` 避免無效請求
- `sessionStorage` 保存展開狀態（`getOpenedNodeIds` / `restoreOriginCollapsedState`）
- 選中節點設定 `selectedPostAtom` -> 渲染 PostEdit 面板
