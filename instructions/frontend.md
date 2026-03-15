# Power Docs — Frontend Development Guide

> **📁 Intended location:** `instructions/frontend.md`
> **Last Updated:** 2025-01-01

---

## Setup & Dev Server

```bash
# Install dependencies
pnpm install

# Start Vite dev server (port 5175)
pnpm dev

# Build for production
pnpm build
```

Vite integrates with WordPress via `kucrut/vite-for-wp`. In dev mode, WordPress loads assets from `http://localhost:5175`.

---

## Project Structure

```
js/src/
├── main.tsx              # Entry point — mounts React into #power_docs
├── App1.tsx              # Refine.dev admin shell with HashRouter
├── resources/
│   └── index.tsx         # Refine resource definitions (nav items + routes)
├── hooks/
│   ├── index.tsx         # Re-exports all hooks
│   ├── useEnv.tsx        # Typed access to PHP-localized env vars
│   ├── useDocSelect.tsx  # Hook for doc selection in dropdowns
│   ├── useGCDItems.tsx   # GCD (greatest common denominator) items utility
│   └── useProductsOptions.tsx # Product options for dropdowns
├── pages/
│   └── admin/
│       ├── index.tsx     # Re-exports all admin pages
│       ├── Docs/         # Knowledge base CRUD pages
│       ├── Users/        # User management page
│       ├── DocAccess/    # Product ↔ doc binding page
│       ├── WpMediaLibraryPage/
│       └── BunnyMediaLibraryPage/
├── components/
│   ├── general/          # General-purpose components
│   ├── post/             # Post-related components
│   └── user/
│       ├── index.tsx
│       └── UserTable/    # Reusable user access management table
├── types/                # TypeScript type definitions
└── utils/
    ├── index.tsx         # Re-exports
    ├── env.tsx           # Env decryption + constants
    ├── constants.ts      # Status options, product types, etc.
    ├── api.tsx           # API utility functions
    ├── functions/        # General utility functions
    └── wcStoreApi/       # WC Store API utilities
```

---

## Path Aliases

```typescript
// tsconfig.json / vite.config.ts
'@/*'           → 'js/src/*'
```

---

## Environment Variables

PHP encrypts env data with Powerhouse's `simple_encrypt()` and passes it as `window.power_docs_data.env`.

**Always use `useEnv()` from `@/hooks`** (not directly from `antd-toolkit`) for typed access:

```typescript
import { useEnv } from '@/hooks'

const MyComponent = () => {
    const {
        SITE_URL,
        API_URL,
        DOCS_POST_TYPE,     // 'pd_doc'
        BOUND_META_KEY,     // 'bound_docs_data'
        ELEMENTOR_ENABLED,
        KEBAB,              // 'power-docs'
        SNAKE,              // 'power_docs'
        NONCE,
        AXIOS_INSTANCE,     // pre-configured axios with X-WP-Nonce
    } = useEnv()
}
```

**Static env values** (used outside React components):
```typescript
import { env, API_URL, APP1_SELECTOR, DOCS_POST_TYPE } from '@/utils'
```

---

## Refine.dev Framework

### Data Fetching Pattern

```typescript
import { useTable } from '@refinedev/antd'
import { useForm } from '@refinedev/antd'
import { useCreate, useDeleteMany, useCustomMutation } from '@refinedev/core'

// List with filters
const { tableProps } = useTable<TDocBaseRecord>({
    resource: 'posts',   // Powerhouse generic post resource
    filters: {
        permanent: objToCrudFilters({
            post_type: DOCS_POST_TYPE,    // filter by post type
            meta_keys: ['need_access'],   // expose these meta keys in response
        }),
    },
})

// Edit form
const { formProps, form, saveButtonProps, query, mutation, onFinish } =
    useForm<TDocRecord>({
        action: 'edit',
        resource: 'posts',
        id,
        redirect: false,
        queryMeta: {
            variables: {
                meta_keys: ['need_access', 'bg_images'], // extra meta to fetch
            },
        },
    })

// Create
const { mutate: create } = useCreate({
    resource: 'posts',
    invalidates: ['list'],
    meta: {
        headers: { 'Content-Type': 'multipart/form-data;' },
    },
})

create({
    values: {
        name: '新知識庫',
        post_type: DOCS_POST_TYPE,
    },
})
```

### Custom API Call

```typescript
import { useCustomMutation, useApiUrl } from '@refinedev/core'

const apiUrl = useApiUrl()     // default provider base URL
const { mutate } = useCustomMutation()

mutate({
    url: `${apiUrl}/posts/sort`,
    method: 'post',
    values: { from_tree, to_tree },
}, {
    onSuccess: () => { /* ... */ },
    onError: () => { /* ... */ },
    onSettled: () => {
        invalidate({ resource: 'posts', invalidates: ['list'] })
    },
})
```

---

## Form Submission

**Always use `toFormData()` from `antd-toolkit`** before calling `onFinish()`. This handles:
- Empty arrays serialized as `'[]'` (prevents losing empty selections)
- File objects → `FormData` for PHP file uploads

```typescript
import { toFormData } from 'antd-toolkit'

const handleOnFinish = () => {
    const values = form.getFieldsValue()
    // Remove fields you don't want to send
    const { short_description, ...rest } = values
    onFinish(toFormData(rest) as Partial<TDocRecord>)
}
```

---

## Adding a New Admin Page

### 1. Create the component

```typescript
// js/src/pages/admin/MyPage/index.tsx
import { List } from '@refinedev/antd'

export const MyPage = () => {
    return (
        <List title="My Page">
            {/* content */}
        </List>
    )
}
```

### 2. Export from admin index

```typescript
// js/src/pages/admin/index.tsx
export { MyPage } from './MyPage'
```

### 3. Add resource

```typescript
// js/src/resources/index.tsx
{
    name: 'my-resource',
    list: '/my-page',
    meta: {
        label: '我的頁面',
        icon: <SomeIcon />,
    },
},
```

### 4. Add route

```typescript
// js/src/App1.tsx
import { MyPage } from '@/pages/admin'

<Route path="my-page" element={<MyPage />} />
```

---

## Adding a New Doc Meta Field

### 1. Update TypeScript type

```typescript
// js/src/pages/admin/Docs/List/types/index.ts
type TDocBaseRecord = {
    // ... existing fields
    my_new_field: string    // add here
}
```

### 2. Add form field in Description tab

```typescript
// js/src/pages/admin/Docs/Edit/tabs/Description/index.tsx
<Item name={['my_new_field']} label="My Field">
    <Input allowClear />
</Item>
```

### 3. Include in query

```typescript
// js/src/pages/admin/Docs/Edit/index.tsx
queryMeta: {
    variables: {
        meta_keys: [
            'need_access',
            'bg_images',
            'my_new_field',  // add here
        ],
    },
},
```

### 4. Expose in PHP

```php
// inc/classes/Domains/Doc/Api.php → extend_post_meta_keys()
if (isset($meta_keys['my_new_field'])) {
    $meta_keys['my_new_field'] = \get_post_meta($post->ID, 'my_new_field', true) ?: '';
}
```

---

## Component Conventions

### Memo + Named Export

```typescript
import { memo } from 'react'

const MyComponentImpl = ({ prop }: { prop: string }) => {
    return <div>{prop}</div>
}

export const MyComponent = memo(MyComponentImpl)
```

### Using `useEnv()` in Components

```typescript
import { useEnv } from '@/hooks'

const MyComponent = () => {
    const { SITE_URL, DOCS_POST_TYPE, ELEMENTOR_ENABLED } = useEnv()
    // ...
}
```

### Jotai State (for cross-component state)

```typescript
// atoms.tsx
import { atom } from 'jotai'
import { TDocRecord } from '@/pages/admin/Docs/List/types'

export const selectedPostAtom = atom<TDocRecord | null>(null)
export const selectedIdsAtom  = atom<string[]>([])

// Usage in component
import { useAtom } from 'jotai'
import { selectedPostAtom } from './atom'

const [selectedPost, setSelectedPost] = useAtom(selectedPostAtom)
```

---

## Styling

### TailwindCSS

All Tailwind utilities are scoped inside `#tw` container:

```html
<!-- In PHP template -->
<div id="tw">
    <div class="flex items-center gap-4">  <!-- works -->
        ...
    </div>
</div>
```

**Avoid WordPress-conflicting class names** — use aliases instead:

| Instead of | Use |
|---|---|
| `hidden` | `tw-hidden` |
| `fixed` | `tw-fixed` |
| `block` | `tw-block` |
| `inline` | `tw-inline` |

### DaisyUI

Use with `pc-` prefix:

```html
<button class="pc-btn pc-btn-primary">Click</button>
<div class="pc-divider"></div>
<ul class="pc-toc">...</ul>
```

### Custom Theme Colors

```typescript
// Primary: #377cfb (blue)
// Secondary: #66cc8a (green)
// Accent: #f68067 (orange-red)

// In Tailwind classes:
'text-primary'     // #377cfb
'bg-primary/10'    // #377cfb at 10% opacity
'text-base-content' // Dark text
'bg-base-200'      // Light background
```

---

## Key Third-Party Hooks & Components

### From `antd-toolkit`

```typescript
import {
    useEnv,           // EnvProvider context access
    toFormData,       // Form → FormData serialization
    Heading,          // Section heading component
    Switch,           // Ant Design Form.Item + Switch
    CopyText,         // Copy-to-clipboard component
    BlockNoteDrawer,  // BlockNote rich text editor in Drawer
    DescriptionDrawer, // Editor picker (BlockNote or Elementor)
    PopconfirmDelete, // Delete confirmation popover
    cn,               // Class names utility
    useRowSelection,  // Ant Design Table row selection
    getDefaultPaginationProps, // Table pagination config
    defaultTableProps, // Default table props
    getGCDItems,      // Greatest common denominator items
    simpleDecrypt,    // Decrypt PHP-encrypted env data
    objToCrudFilters, // Object → Refine CRUD filters
    FilterTags,       // Display active filters as tags
    notificationProps, // Standard notification config
} from 'antd-toolkit'

import { FileUpload } from 'antd-toolkit/wp'         // WP media upload
import { dataProvider, notificationProvider, useBunny,
         MediaLibraryNotification } from 'antd-toolkit/refine'
import { useItemSelect } from 'antd-toolkit/wp'      // Item select hook
```

### From `@refinedev/antd`

```typescript
import {
    useTable,      // Table with pagination + filters
    useForm,       // Form with CRUD operations
    Edit,          // Edit page wrapper
    List,          // List page wrapper
} from '@refinedev/antd'
```

### From `@refinedev/core`

```typescript
import {
    useCreate,          // Create mutation
    useDeleteMany,      // Bulk delete mutation
    useCustomMutation,  // Custom API call
    useInvalidate,      // Cache invalidation
    useParsed,          // URL params parsing (id, etc.)
    useApiUrl,          // Get data provider base URL
} from '@refinedev/core'
```

### From `@ant-design/pro-editor`

```typescript
import { SortableTree, TreeData } from '@ant-design/pro-editor'
// Used in SortablePosts for chapter drag-and-drop
// MAX_DEPTH = 2 enforced via sortableRule prop
```

---

## SortablePosts: Key Implementation Details

The `SortablePosts` component at `pages/admin/Docs/Edit/tabs/SortablePosts/index.tsx` manages chapter/article ordering.

### State Persistence

```typescript
// When user leaves page, save expanded node IDs to sessionStorage
// When component mounts, restore the expanded state
// This persists across React Router navigation
```

### Sort API Call

```typescript
// POST /posts/sort
// body: { from_tree: [...], to_tree: [...] }
// Only fires if trees are different (isEqual check)
// from_tree = original tree state
// to_tree   = new tree state after drag
```

### Depth Constraint

```typescript
export const MAX_DEPTH = 2

sortableRule: ({ activeNode, projected }) => {
    const nodeDepth = getMaxDepth([activeNode])
    const maxDepth  = projected?.depth + nodeDepth
    const sortable  = maxDepth <= MAX_DEPTH
    if (!sortable) message.error('超過最大深度，無法執行')
    return sortable
}
```

---

## DocAccess: Product ↔ Doc Binding

The `DocAccess` page at `/doc-access` lists WooCommerce products and lets admins bind docs to each product. Binding means "buying this product grants access to these docs".

The binding is stored as `bound_docs_data` post meta on WC products.

---

## TypeScript Strict Patterns

```typescript
// ✅ Good: form field name as array
<Item name={['field_name']} label="...">

// ✅ Good: null check before usage
const record = query?.data?.data
if (!record) return null

// ✅ Good: explicit generic types on hooks
useForm<TDocRecord, HttpError, Partial<TDocRecord>>({ ... })

// ✅ Good: memo on all components
export const MyComponent = memo(MyComponentImpl)

// ❌ Avoid: direct env access without hook in components
const env = window.power_docs_data // Don't do this in components
```
