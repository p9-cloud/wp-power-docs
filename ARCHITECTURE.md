# Power Docs — Architecture Overview

> **Last Updated:** 2025-01-01
> **See also:** `copilot-instructions.md` for full AI coding guide

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    WordPress Site                           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Power Docs Plugin                      │   │
│  │                                                     │   │
│  │  ┌──────────────┐     ┌──────────────────────────┐  │   │
│  │  │  PHP Backend │     │  React Admin SPA         │  │   │
│  │  │              │     │  (wp-admin?page=power-docs│  │   │
│  │  │  Bootstrap   │     │                          │  │   │
│  │  │  Domains:    │────▶│  Refine.dev + Ant Design │  │   │
│  │  │  - Doc       │     │  HashRouter routing      │  │   │
│  │  │  - Product   │     │  @tanstack/react-query   │  │   │
│  │  │  - User      │     │  Jotai atoms             │  │   │
│  │  │  - Elementor │     └──────────────────────────┘  │   │
│  │  │              │                                    │   │
│  │  │  Templates:  │     ┌──────────────────────────┐  │   │
│  │  │  - landing   │     │  Frontend (Public)       │  │   │
│  │  │  - detail    │     │                          │  │   │
│  │  │  - search    │     │  PHP Templates           │  │   │
│  │  └──────────────┘     │  TailwindCSS + DaisyUI   │  │   │
│  │                       │  jQuery (legacy)         │  │   │
│  │                       └──────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  WooCommerce │  │  Powerhouse  │  │  Elementor       │  │
│  │  (required)  │  │  (required)  │  │  (optional)      │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
power-docs/
├── plugin.php                          # Entry: Plugin class (PluginTrait + SingletonTrait)
├── composer.json                       # PHP deps (PSR-4 autoload)
├── package.json                        # JS scripts + workspace deps
├── vite.config.ts                      # Vite build (port 5175 → js/dist)
├── tailwind.config.cjs                 # TailwindCSS + DaisyUI (pc- prefix)
├── tsconfig.json                       # TypeScript config
├── phpcs.xml                           # PHPCS rules
├── phpstan.neon                        # PHPStan config
│
├── inc/
│   ├── classes/
│   │   ├── Bootstrap.php               # Bootstraps all domains
│   │   ├── Admin/
│   │   │   └── Entry.php               # Full-screen admin page renderer
│   │   ├── Domains/
│   │   │   ├── Doc/
│   │   │   │   ├── Loader.php          # Domain loader
│   │   │   │   ├── CPT.php             # pd_doc custom post type
│   │   │   │   ├── Access.php          # Access control
│   │   │   │   ├── Api.php             # REST API extensions
│   │   │   │   ├── Templates.php       # Template overrides
│   │   │   │   └── Utils.php           # Sidebar HTML builder
│   │   │   ├── Product/
│   │   │   │   └── Api.php             # Product meta exposure
│   │   │   ├── User/
│   │   │   │   └── Api.php             # Custom user endpoint
│   │   │   └── Elementor/
│   │   │       ├── Loader.php          # Widget registrar
│   │   │       ├── Card.php            # Category card widget
│   │   │       └── Search.php          # Search widget
│   │   ├── Helper/
│   │   │   └── TOCGenerator.php        # DOMDocument TOC builder
│   │   ├── Compatibility/
│   │   │   └── Compatibility.php       # Upgrade migrations
│   │   └── Utils/
│   │       └── Base.php                # APP1_SELECTOR constant
│   └── templates/
│       ├── single-pd_doc.php           # Template dispatcher
│       └── pages/
│           ├── doc-landing/
│           │   └── index.php           # KB index (hero + cards)
│           ├── doc-detail/
│           │   ├── index.php           # 3-col detail layout
│           │   ├── sider/
│           │   │   ├── index.php       # Nav tree (recursive HTML)
│           │   │   └── mobile-menu.php # Mobile overlay nav
│           │   ├── main/
│           │   │   └── index.php       # Breadcrumb + content + prev/next
│           │   └── toc/
│           │       └── index.php       # Table of contents
│           └── doc-search/
│               └── index.php           # Search results
│
└── js/
    ├── dist/                           # Built output (vite build)
    └── src/
        ├── main.tsx                    # React mount entry
        ├── App1.tsx                    # Refine app shell + routes
        ├── resources/
        │   └── index.tsx               # Refine resource definitions
        ├── hooks/
        │   ├── index.tsx               # Hook exports
        │   ├── useEnv.tsx              # Typed env access
        │   ├── useDocSelect.tsx        # Doc select hook
        │   ├── useGCDItems.tsx         # GCD items utility
        │   └── useProductsOptions.tsx  # Product options
        ├── pages/
        │   └── admin/
        │       ├── index.tsx           # Page exports
        │       ├── Docs/
        │       │   ├── List/           # KB list table
        │       │   │   ├── index.tsx
        │       │   │   ├── Table/      # Ant Design Table + columns
        │       │   │   ├── hooks/      # useColumns, useValueLabelMapper
        │       │   │   └── types/      # TDocBaseRecord, TDocRecord
        │       │   └── Edit/           # KB editor
        │       │       ├── index.tsx   # 3-tab layout
        │       │       ├── PostEdit/   # Chapter inline editor
        │       │       └── tabs/
        │       │           ├── Description/    # KB metadata form
        │       │           └── SortablePosts/  # Drag-and-drop tree
        │       ├── Users/              # User management page
        │       ├── DocAccess/          # Product ↔ doc binding
        │       ├── WpMediaLibraryPage/ # WP media
        │       └── BunnyMediaLibraryPage/ # Bunny media
        ├── components/
        │   ├── general/                # General components
        │   ├── post/                   # Post-related components
        │   └── user/
        │       ├── index.tsx           # User component exports
        │       └── UserTable/          # Reusable user table with access mgmt
        ├── types/                      # TypeScript type definitions
        ├── utils/
        │   ├── index.tsx               # Utility exports
        │   ├── env.tsx                 # Env decryption + exports
        │   ├── constants.ts            # Status options, product types, etc.
        │   ├── api.tsx                 # API utilities
        │   ├── functions/              # Helper functions
        │   └── wcStoreApi/             # WC Store API utilities
        └── assets/                     # Static assets
```

---

## Data Flow

### Content Viewing (Frontend Public)

```
User visits /pd_doc/{slug}
  → WordPress loads single-pd_doc.php
  → Check access: Access::can_access($top_parent_id)
    → If denied & not admin → wp_safe_redirect($unauthorized_redirect_url)
  → Route to template:
    ?search=      → doc-search (WP_Query + highlight)
    root post     → doc-landing (hero + child cards)
    child post    → doc-detail (sider + main + toc)
  → TOCGenerator parses content HTML → injects heading IDs → returns TOC HTML
  → sider: Utils::get_children_posts_html_uncached($top_parent_id)
  → JavaScript: sidebar expand/collapse + sessionStorage state
```

### Content Editing (Admin React SPA)

```
Admin visits wp-admin?page=power-docs
  → Entry::render_page() → outputs #power_docs div
  → React mounts: main.tsx → App1.tsx
  → Refine dataProvider calls Powerhouse REST API
  → DocsEdit loads post data with meta_keys: ['need_access','bg_images',...]
  → SortablePosts loads children via GET /posts?post_type=pd_doc&parent_id=...
  → Drag reorder → POST /posts/sort {from_tree, to_tree}
  → PostEdit saves to PATCH /posts/{id}
```

### Access Grant (WooCommerce Purchase)

```
Customer completes order
  → woocommerce_order_status_completed fires
  → Access::grant_access($order_id)
  → For each order item → check product's 'bound_docs_data' meta
  → For each BoundItemData → BoundItemData::grant_user($user_id, $order)
  → Writes to wp_ph_access_itemmeta: (post_id, user_id, 'expire_date', value)
```

---

## Dependency Map

### PHP Dependencies

```
J7\PowerDocs\Plugin
  uses → J7\WpUtils\Traits\PluginTrait    (j7-dev/wp-plugin-trait)
  uses → J7\WpUtils\Traits\SingletonTrait (j7-dev/wp-plugin-trait)

J7\PowerDocs\Bootstrap
  uses → Kucrut\Vite                      (kucrut/vite-for-wp)
  uses → J7\Powerhouse\Utils\Base         (powerhouse plugin)
  uses → J7\Powerhouse\Settings\Model\Settings (powerhouse plugin)

J7\PowerDocs\Domains\Doc\Access
  uses → J7\Powerhouse\Domains\Limit\Models\BoundItemsData
  uses → J7\Powerhouse\Domains\Limit\Models\BoundItemData
  uses → J7\Powerhouse\Domains\Limit\Utils\MetaCRUD
  uses → J7\Powerhouse\Domains\Limit\Models\ExpireDate

J7\PowerDocs\Domains\Doc\Api
  uses → J7\Powerhouse\Domains\Limit\Models\GrantedItems
  uses → J7\WpUtils\Classes\WP

J7\PowerDocs\Domains\User\Api
  uses → J7\Powerhouse\Domains\User\Model\User
  uses → J7\WpUtils\Classes\WP

J7\PowerDocs\Domains\Doc\Templates
  uses → J7\Powerhouse\Domains\Post\Utils (get_top_post_id)

J7\PowerDocs\Domains\Elementor\Card
  uses → J7\Powerhouse\Plugin::load_template()

J7\PowerDocs\Domains\Elementor\Search
  uses → J7\Powerhouse\Plugin::load_template()
```

### JavaScript / Frontend Dependencies

```
antd-toolkit (workspace)
  → provides: dataProvider, simpleDecrypt, toFormData, useEnv/EnvProvider,
              BlockNoteDrawer, DescriptionDrawer, CopyText, Heading, Switch,
              PopconfirmDelete, cn, useRowSelection, getDefaultPaginationProps,
              defaultTableProps, FilterTags, objToCrudFilters, notificationProps,
              notificationProvider, useBunny, BunnyProvider, MediaLibraryNotification

@refinedev/core + @refinedev/antd + @refinedev/react-router
  → admin framework: Refine, useTable, useForm, useCreate, useDeleteMany,
                    useCustomMutation, useParsed, useInvalidate, useApiUrl

antd (Ant Design 5)
  → UI components: Table, Form, Input, Button, Tabs, Switch, Radio, etc.

@ant-design/pro-editor
  → SortableTree (drag-and-drop chapter management)

@tanstack/react-query
  → QueryClient, QueryClientProvider, ReactQueryDevtools

jotai
  → atom, useAtom (selectedPostAtom, selectedIdsAtom, productsAtom)

react-router (v6)
  → HashRouter, Routes, Route, Outlet, useNavigate

lodash-es
  → isEqual (for SortablePosts change detection)
```

---

## External Services

| Service | Purpose | Config Location |
|---|---|---|
| **Bunny.net Stream** | Video hosting for doc content | Powerhouse Settings (`bunny_library_id`, `bunny_cdn_hostname`, `bunny_stream_api_key`) |
| **WooCommerce** | Purchase gating + access grants | WordPress site |
| **Powerhouse** | REST API, Access table, Theme system | `j7-dev/wp-powerhouse` plugin |

---

## Database Tables Used

| Table | Plugin | Purpose |
|---|---|---|
| `wp_posts` | WordPress | `pd_doc` posts |
| `wp_postmeta` | WordPress | All doc meta fields |
| `wp_ph_access_itemmeta` | **Powerhouse** | User access records with `expire_date` |
| `wp_users` + `wp_usermeta` | WordPress | User data + user meta |
