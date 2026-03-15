# Power Docs — GitHub Copilot Instructions

> **📁 Intended location:** `.github/copilot-instructions.md`
> Place this file at the path above so GitHub Copilot picks it up automatically.
> Run: `mkdir .github && move copilot-instructions.md .github\copilot-instructions.md`
>
> **Last Updated:** 2025-01-01
> **Plugin Version:** 1.2.7
> **PHP Namespace:** `J7\PowerDocs`
> **Text Domain:** `power_docs`

---

## Project Overview

**Power Docs** is a WordPress plugin for building rich knowledge-base pages and managing subscriber-based content monetization. It registers a hierarchical custom post type (`pd_doc`), integrates with WooCommerce for purchase-gated access, and provides a React/TypeScript admin panel built with Refine.dev.

This plugin depends on a sister plugin called **Powerhouse** (`j7-dev/wp-powerhouse`) which provides shared utilities, REST API infrastructure, Limit/Access models, and the frontend toolkit (`antd-toolkit`).

---

## Technology Stack

### PHP Backend
| Layer | Technology |
|---|---|
| Language | PHP 8.0+ (`declare(strict_types=1)` in all files) |
| Autoloading | Composer PSR-4 (`J7\PowerDocs\` → `inc/classes/`) |
| WordPress | 5.7+ |
| WooCommerce | 7.6.0+ (required) |
| Utilities | `j7-dev/wp-plugin-trait` — `PluginTrait`, `SingletonTrait` |
| Vite Integration | `kucrut/vite-for-wp` |
| Code Style | PHPCS + WPCS + PHPStan |

### JavaScript Frontend
| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript |
| Build Tool | Vite 5 via `@kucrut/vite-for-wp` |
| Admin Framework | Refine.dev (`@refinedev/core`, `@refinedev/antd`) |
| UI Library | Ant Design 5 + `antd-toolkit` |
| CSS | TailwindCSS + DaisyUI (prefix: `pc-`) |
| State | `@tanstack/react-query` + Jotai atoms |
| Routing | React Router v6 with `HashRouter` |
| Rich Text | BlockNote via `antd-toolkit` (`BlockNoteDrawer`, `DescriptionDrawer`) |
| Drag & Drop | `@ant-design/pro-editor` `SortableTree` |

---

## PHP Architecture

### Entry Point: `plugin.php`

```php
namespace J7\PowerDocs;

final class Plugin {
    use \J7\WpUtils\Traits\PluginTrait;   // $dir, $url, $kebab, $snake, load_template(), etc.
    use \J7\WpUtils\Traits\SingletonTrait; // ::instance()

    public static bool $is_local = false;  // true when wp_get_environment_type() === 'local'
    // template_page_names: ['doc-landing', 'doc-detail', 'doc-search']
}
```

**Key static properties from `PluginTrait`:**
- `Plugin::$dir` — absolute filesystem path to plugin root
- `Plugin::$url` — plugin URL
- `Plugin::$kebab` → `'power-docs'`
- `Plugin::$snake` → `'power_docs'`
- `Plugin::$app_name` → `'Power Docs'`
- `Plugin::load_template(string $name, array $args = [])` — load a PHP template from `inc/templates/pages/`

### Bootstrap (`inc/classes/Bootstrap.php`)

Instantiates all domain classes in the constructor:
```php
Admin\Entry::instance();
Domains\Doc\Loader::instance();
Domains\Product\Api::instance();
Domains\User\Api::instance();
Domains\Elementor\Loader::instance();
Compatibility\Compatibility::instance();
```

**Script localization pattern:** Env vars are **encrypted** via `PowerhouseUtils::simple_encrypt()` and passed as `window.power_docs_data.env`. Frontend decrypts with `simpleDecrypt()` from `antd-toolkit`.

### Domain Structure

```
inc/classes/
├── Bootstrap.php               # Bootstraps all domains
├── Admin/
│   └── Entry.php               # WP admin page shell (full-screen React app)
├── Domains/
│   ├── Doc/
│   │   ├── Loader.php          # Instantiates all Doc sub-classes
│   │   ├── CPT.php             # Registers pd_doc post type
│   │   ├── Access.php          # Grant/check doc access
│   │   ├── Api.php             # Extends Powerhouse REST API via filters
│   │   ├── Templates.php       # single_template override + admin bar item
│   │   └── Utils.php           # Recursive sidebar HTML generation
│   ├── Product/
│   │   └── Api.php             # Exposes bound_docs_data on WC products
│   ├── User/
│   │   └── Api.php             # Custom /users endpoint with granted_docs filter
│   └── Elementor/
│       ├── Loader.php          # Registers Elementor widgets (optional)
│       ├── Card.php            # "知識庫子文章分類卡片" widget
│       └── Search.php          # "知識庫搜尋框" widget
├── Helper/
│   └── TOCGenerator.php        # PHP DOMDocument-based TOC builder
├── Compatibility/
│   └── Compatibility.php       # Version migration on upgrader_process_complete
└── Utils/
    └── Base.php                # APP1_SELECTOR constant = '#power_docs'
```

---

## Custom Post Type: `pd_doc`

- **Post Type Slug:** `pd_doc` — constant `CPT::POST_TYPE`
- **Hierarchical:** Yes — parent/child relationships
- **Admin visibility:** Hidden from WP menus in production (`$is_local = false`); shown only in local dev
- **REST API:** Enabled (`show_in_rest = true`)
- **Supports:** `title`, `editor`, `thumbnail`, `custom-fields`, `author`, `page-attributes`

### Three-Level Hierarchy (enforced by UI, not DB)

```
pd_doc (depth 0, post_parent = 0)      ← "知識庫" Knowledge Base root
  └── pd_doc (depth 1)                  ← "章節" Section / Chapter
        └── pd_doc (depth 2)            ← "單元" Article / Unit
```

- `MAX_DEPTH = 2` is enforced in the React `SortableTree` component
- Depth is computed from post hierarchy and exposed via API

### Key Post Meta Fields

| Meta Key | PHP Type | Level | Purpose |
|---|---|---|---|
| `need_access` | `'yes'\|'no'` | Root only | Require purchase to view |
| `editor` | `'power-editor'\|'elementor'\|''` | All levels | Which editor renders content |
| `bg_images` | `int` (attachment ID) | Root only | Background image for landing page |
| `pd_keywords` | serialized array | Root only | Hot-search keyword tags |
| `pd_keywords_label` | `string` | Root only | Label above keywords (default: `'大家都在搜：'`) |
| `unauthorized_redirect_url` | `string` | Root only | Redirect URL when access denied (default: `site_url('404')`) |
| `_elementor_data` | `string` | Any | Elementor builder JSON (cleared when `editor = 'power-editor'`) |

**Defaults set on creation** (via `powerhouse/post/create_post_args` filter, root docs only):
```php
'pd_keywords_label'         => '大家都在搜：',
'pd_keywords'               => [['id' => 'some_keyword_id', 'title' => '某個關鍵字']],
'unauthorized_redirect_url' => site_url('404'),
```

---

## Access Control System

### Architecture
The access system uses Powerhouse's `ph_access_itemmeta` database table with the schema:
`(id, post_id, user_id, meta_key, meta_value)` — where `meta_key = 'expire_date'`.

### Grant Flow (WooCommerce Order)
```
woocommerce_order_status_completed
  → Access::grant_access($order_id)
    → foreach order item → get product's 'bound_docs_data' meta
      → foreach BoundItemData → BoundItemData::grant_user($user_id, $order)
        → writes expire_date to ph_access_itemmeta
```

### Check Flow (Frontend View)
```php
// in single-pd_doc.php
$can_access = Access::can_access($top_parent_id); // checks top-level doc only
$is_admin   = current_user_can('manage_options');  // admins bypass

if (!$can_access && !$is_admin) {
    wp_safe_redirect(get_post_meta($top_parent_id, 'unauthorized_redirect_url', true));
    exit;
}
```

### `Access::can_access($post_id, $user_id = null): bool`
1. Check `need_access` meta on `$post_id` — if `'no'`, return `true` (free access)
2. Check if user is logged in — if not, return `false`
3. Query `ph_access_itemmeta` for `expire_date` → instantiate `ExpireDate` → return `!is_expired`

### Product Binding
Products store `bound_docs_data` post meta (array of Powerhouse `BoundItemData` objects). Managed in the admin via the **DocAccess** page (`/doc-access`).

`BOUND_META_KEY = 'bound_docs_data'` constant in `Product\Api`.

---

## Template System

### Template Routing (`inc/templates/single-pd_doc.php`)

```php
if ($search) {
    Plugin::load_template('doc-search');       // ?search= param present
} else {
    Plugin::load_template($post->post_parent
        ? 'doc-detail'      // child post → article detail view
        : 'doc-landing'     // root post → knowledge base index
    );
}
```

### Page Templates

#### `doc-landing` — Knowledge Base Index
- Renders Powerhouse `hero` template
- Queries direct children ordered by `menu_order ASC, ID ASC`
- Loops children → renders Powerhouse `card` template for each
- Supports Elementor override: if `editor === 'elementor'` or `?elementor-preview`, uses `the_content()`

#### `doc-detail` — Article Detail (3-column)
```
[sider] | [main content] | [toc]
```
- Mobile: sider and TOC are off-canvas panels (slide in/out)
- Desktop (`xl:`): side-by-side columns
- **sider:** Recursive nav tree from `Utils::get_children_posts_html_uncached($top_parent_id)`
- **main:** Breadcrumb + H1 + content (or Elementor) + children cards + prev/next
- **toc:** TOC generated by `TOCGenerator`; sticky on desktop; `TocToggler` JS class on mobile

#### `doc-search` — Search Results
- Queries posts with `s` param within the knowledge base subtree (`post__in` scoped)
- Keyword highlighting with jQuery `highlightText()`
- Pagination via Powerhouse `pagination` template

### TOC Generator (`inc/classes/Helper/TOCGenerator.php`)

```php
$toc = new TOCGenerator($post_content);
$toc_html     = $toc->get_toc_html([2,3,4,5,6]); // returns <ul class="pc-toc">
$content_html = $toc->get_html();                  // returns modified HTML with IDs on headings
```

Uses `DOMDocument` + `DOMXPath` to inject `id="toc-{wp_unique_id()}"` on headings.

### Sider Navigation (`Utils::get_children_posts_html_uncached`)

Generates nested `<ul>` HTML recursively. Features:
- Active page highlighted with `bg-primary/10 font-bold` classes
- Child nodes include arrow icon for expand/collapse
- JavaScript in `sider/index.php` handles click → slide toggle
- `sessionStorage` key `expanded_post_ids` persists expanded state across navigation

### Theme Override
Themes can override the doc template by placing `single-pd_doc.php` in their theme directory — this takes priority (`Templates::template_override()` checks theme first).

---

## WordPress Hooks Reference

### Actions Registered

| Hook | Priority | Class | Description |
|---|---|---|---|
| `init` | default | `CPT` | Register `pd_doc` post type |
| `admin_enqueue_scripts` | default | `Bootstrap` | Enqueue React admin app |
| `admin_bar_menu` | **210** | `Templates` | Add "編輯知識庫" link in admin bar |
| `woocommerce_order_status_completed` | 10 | `Access` | Grant doc access on purchase |
| `upgrader_process_complete` | default | `Compatibility` | Run migration code on upgrade |
| `elementor/widgets/register` | default | `Elementor\Loader` | Register Card + Search widgets |
| `current_screen` | 10 | `Admin\Entry` | Render full-screen admin page |
| `save_post_pd_doc` | 10 | `CPT` | Clear transient cache |
| `save_post_pd_doc` | 10 | `CPT` | Clear Elementor data for power-editor posts |

### Filters Registered

| Hook | Priority | Class | Purpose |
|---|---|---|---|
| `single_template` | **9999** | `Templates` | Override template for `pd_doc` |
| `option_elementor_cpt_support` | default | `CPT` | Add `pd_doc` to Elementor CPT list |
| `powerhouse/user/get_meta_keys_array` | 10 | `Doc\Api` | Expose `granted_docs` in user API response |
| `powerhouse/post/get_meta_keys_array` | 10 | `Doc\Api` | Expose `editor`, `bg_images` in post response |
| `powerhouse/post/separator_body_params` | 10 | `Doc\Api` | Handle `bg_images` file upload |
| `powerhouse/post/create_post_args` | 10 | `Doc\Api` | Set default meta on new root doc |
| `powerhouse/copy/children_post_args` | 10 | `Doc\Api` | Set `post_type = pd_doc` on copy |
| `powerhouse/product/get_meta_keys_array` | 10 | `Product\Api` | Expose `bound_docs_data` on products |

---

## REST API

### Base Namespace: `power-docs/v1`

| Method | Endpoint | Class | Description |
|---|---|---|---|
| `GET` | `/wp-json/power-docs/v1/users` | `User\Api` | Paginated user list with doc access filter |

### `GET /users` Parameters

| Param | Type | Default | Description |
|---|---|---|---|
| `posts_per_page` | `int` | `20` | Items per page |
| `paged` | `int` | `1` | Page number |
| `s` or `search` | `string` | `''` | Search by ID, login, email, nicename, display_name |
| `orderby` | `string` | `'ID'` | Sort column |
| `order` | `string` | `'DESC'` | Sort direction |
| `granted_docs` | `int[]` | — | Filter users who hold access to ALL listed doc IDs (via `ph_access_itemmeta` JOIN) |
| `meta_key` | `string` | — | Filter by user meta key |
| `meta_value` | `string` | — | Filter by user meta value |

**Response headers:** `X-WP-Total`, `X-WP-TotalPages`, `X-WP-CurrentPage`, `X-WP-PageSize`

### Extending via Powerhouse Filters
The plugin does **not** define its own `/posts` or `/products` endpoints — it **extends** Powerhouse's generic REST API via filters to expose doc-specific fields.

---

## Frontend Architecture

### Entry Point & Mount

```typescript
// js/src/main.tsx
// Mounts App1 into every element matching APP1_SELECTOR (#power_docs)
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#power_docs').forEach(el =>
        ReactDOM.createRoot(el).render(<App1 />)
    )
})
```

### App Shell (`js/src/App1.tsx`)

```typescript
<HashRouter>
  <Refine dataProvider={...} routerProvider={routerBindings} resources={resources}>
    <Routes>
      <Route element={<ThemedLayoutV2 ...>}>
        <Route index element={<NavigateToResource resource="docs" />} />
        <Route path="docs">...</Route>
        <Route path="users" element={<Users />} />
        <Route path="doc-access" element={<DocAccess />} />
        <Route path="media-library" element={<WpMediaLibraryPage />} />
        <Route path="bunny-media-library" element={<BunnyMediaLibraryPage />} />
      </Route>
    </Routes>
  </Refine>
</HashRouter>
```

### Environment Variables

PHP passes encrypted data as `window.power_docs_data.env`. After `simpleDecrypt()`:

```typescript
type Env = {
  SITE_URL: string              // https://example.com
  API_URL: string               // https://example.com/wp-json
  CURRENT_USER_ID: number
  CURRENT_POST_ID: number
  PERMALINK: string
  APP_NAME: string              // 'Power Docs'
  KEBAB: string                 // 'power-docs'
  SNAKE: string                 // 'power_docs'
  BUNNY_LIBRARY_ID: string
  BUNNY_CDN_HOSTNAME: string
  BUNNY_STREAM_API_KEY: string
  NONCE: string                 // wp_rest nonce for REST authentication
  APP1_SELECTOR: string         // '#power_docs'
  DOCS_POST_TYPE: string        // 'pd_doc'
  BOUND_META_KEY: string        // 'bound_docs_data'
  ELEMENTOR_ENABLED: boolean
  AXIOS_INSTANCE: AxiosInstance // pre-configured with X-WP-Nonce header
}
```

Access via: `import { useEnv } from '@/hooks'`

### Refine Data Providers

```typescript
{
  'default':       `${API_URL}/v2/powerhouse`,  // Powerhouse CRUD API for posts/users/products
  'wp-rest':       `${API_URL}/wp/v2`,           // Native WP REST API
  'wc-rest':       `${API_URL}/wc/v3`,           // WooCommerce REST API
  'wc-store':      `${API_URL}/wc/store/v1`,     // WC Store API (cart, checkout)
  'bunny-stream':  bunny_data_provider_result,   // Bunny.net Stream API
  'power-docs':    `${API_URL}/power-docs`,      // Plugin's own API (users endpoint)
}
```

### Admin Pages & Routes

| Route | Component | File | Description |
|---|---|---|---|
| `/docs` | `DocsList` | `pages/admin/Docs/List/` | Knowledge base list with create/delete |
| `/docs/edit/:id` | `DocsEdit` | `pages/admin/Docs/Edit/` | Edit KB + manage chapters |
| `/users` | `Users` | `pages/admin/Users/` | User list with access management |
| `/doc-access` | `DocAccess` | `pages/admin/DocAccess/` | Product ↔ doc binding table |
| `/media-library` | `WpMediaLibraryPage` | `pages/admin/WpMediaLibraryPage/` | WP media library |
| `/bunny-media-library` | `BunnyMediaLibraryPage` | `pages/admin/BunnyMediaLibraryPage/` | Bunny Stream media |

### DocsEdit Component (`pages/admin/Docs/Edit/index.tsx`)

Three tabs (managed with `forceRender`):

```
Tab 1: 描述 (Description)    forceRender: true   ← KB-level metadata
Tab 2: 文章管理 (SortablePosts) forceRender: false  ← Chapter/article tree
Tab 3: 權限管理 (Users/Access) forceRender: false  ← disabled if need_access !== 'yes'
```

**Form submission:** Converts form values to `FormData` via `toFormData()` from `antd-toolkit` before calling `onFinish()`.

**Resource:** Uses `'posts'` resource (from Powerhouse's generic API) with `post_type: 'pd_doc'` filter.

### SortablePosts (`Edit/tabs/SortablePosts/index.tsx`)

- `@ant-design/pro-editor` `SortableTree`
- `MAX_DEPTH = 2` enforced via `sortableRule` callback
- On tree change: POST `{apiUrl}/posts/sort` with `from_tree` / `to_tree` diff (only saves if changed via lodash `isEqual`)
- `sessionStorage` via `getOpenedNodeIds()` / `restoreOriginCollapsedState()` preserves expand state
- Clicking a node sets `selectedPostAtom` → renders `PostEdit` panel alongside
- Bulk delete via `selectedIdsAtom` + Refine `useDeleteMany`
- `AddPosts` component handles creating new chapters

### PostEdit (`Edit/PostEdit/index.tsx`)

Inline editor panel for a selected chapter/article. Supports:
- Name, slug edit
- `DescriptionDrawer` from `antd-toolkit` (BlockNote or Elementor based on `editor` field)
- Publish/draft toggle
- Preview link
- Separate save button (warn on unsaved changes)

### Key TypeScript Types

```typescript
// js/src/pages/admin/Docs/List/types/index.ts

type TDocBaseRecord = {
  id: string
  depth: number
  name: string
  slug: string
  date_created: string
  date_modified: string
  status: TPostStatus                    // 'publish' | 'draft' | 'pending' | 'private'
  menu_order: number
  permalink: string
  category_ids: TTerm[]
  tag_ids: TTerm[]
  images: TImage[]
  parent_id: string
  bg_images: TImage[]
  editor: 'power-editor' | 'elementor'
  need_access: 'yes' | 'no' | ''
  pd_keywords: string[]
  pd_keywords_label: string
  unauthorized_redirect_url: string
}

type TDocRecord = TDocBaseRecord & TLimit & {
  description: string
  short_description: string
  children?: TDocRecord[]
}
```

---

## Styling Conventions

- **TailwindCSS** scoped under `#tw` via `important: '#tw'` — must wrap with an element having `id="tw"` for Tailwind utilities to work
- **DaisyUI** with prefix `pc-` (e.g., `pc-btn`, `pc-divider`, `pc-toc`)
- **Custom DaisyUI theme** named `power`:
  - `primary`: `#377cfb` (blue)
  - `secondary`: `#66cc8a` (green)
  - `accent`: `#f68067` (orange-red)
- **Animations disabled** in theme (`--animation-btn: 0`, `--animation-input: 0`) to avoid Elementor conflicts
- **Conflicting WordPress classes** are aliased: `tw-hidden`, `tw-fixed`, `tw-block`, `tw-inline`
- **Responsive breakpoints:**
  - `sm: 576px` (iPhone SE)
  - `md: 810px` (iPad Portrait)
  - `lg: 1080px` (iPad Landscape)
  - `xl: 1280px` (MacBook Air)

---

## Coding Conventions

### PHP
- `declare(strict_types=1);` at top of every file
- All classes use `SingletonTrait` — use `::instance()`, never `new ClassName()`
- Constructor registers hooks; static methods used for hook callbacks that don't need `$this`
- Use `\J7\WpUtils\Classes\WC::log($message, $title)` for error logging
- Always escape outputs with `esc_html()`, `esc_url()`, `esc_attr()`
- Transient cache keys: `"power_docs_{key}_{post_id}"`
- Always guard autosave in `save_post_*`: `if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;`

### TypeScript / React
- All components are `React.memo()` wrapped and exported as **named exports**
- Form submission uses `toFormData()` from `antd-toolkit` (handles empty arrays as `'[]'`)
- Use `useEnv()` from `@/hooks` for typed env access (not directly from `antd-toolkit`)
- Path alias `@/` → `js/src/`
- Jotai atoms defined in `atom.tsx` files alongside components that use them

---

## File Upload Handling Pattern

### PHP (`powerhouse/post/separator_body_params` filter in `Doc\Api`)
```php
$image_names = ['bg_images'];
// If file in request → upload to WP media library → store attachment ID
// If body_params[name] === 'delete' → set to ''
// If non-numeric, non-delete → unset (no change to DB)
```

### TypeScript (form submission)
```typescript
// bg_images field in form → passed as FileList via antd Upload
// toFormData() serializes it → PHP receives as $_FILES['bg_images']
```

---

## Caching

| Key Pattern | Cleared By | Description |
|---|---|---|
| `power_docs_get_children_posts_html_{top_parent_id}` | `save_post_pd_doc` | Sidebar HTML cache |

`Utils::get_cache_key($post_id, $key)` generates the key.  
`CPT::delete_transient()` uses `PostUtils::get_top_post_id()` to find the root and clears the root's cache.

---

## Elementor Integration

Two custom widgets registered via `elementor/widgets/register`:

| Widget Class | Title | Icon | Keywords |
|---|---|---|---|
| `Elementor\Card` | 知識庫子文章分類卡片 | `eicon-kit-details` | docs, card, 知識庫 |
| `Elementor\Search` | 知識庫搜尋框 | `eicon-search` | docs, search, 搜尋 |

- Loader checks `active_plugins` for `elementor/elementor.php` before registering
- `pd_doc` added to Elementor CPT support via `option_elementor_cpt_support` filter
- When `editor` is set to `'elementor'` in admin, user must save first then click "使用 Elementor 編輯版面" button
- Saving with `editor = 'power-editor'` clears all `_elementor_*` meta via `CPT::delete_elementor_data()`

---

## Development Commands

```bash
# Install dependencies
pnpm install

# PHP dependencies (run from power-docs/)
composer install

# Frontend dev server (Vite, port 5175)
pnpm dev

# Production build
pnpm build

# Linting
pnpm lint          # ESLint + phpcs
pnpm lint:fix      # ESLint --fix + phpcbf

# Release
pnpm release:patch  # Bump patch, build, GitHub release
pnpm release:minor
pnpm release:major
pnpm zip            # Create distribution zip

# Version sync
pnpm sync:version   # Sync package.json version → plugin.php header

# i18n
pnpm i18n           # Generate languages/power_docs.pot
```

---

## Common AI Assistance Patterns

### Add a New Meta Field to a Doc
1. **PHP expose:** `extend_post_meta_keys()` in `inc/classes/Domains/Doc/Api.php`
2. **Type:** Add to `TDocBaseRecord` in `js/src/pages/admin/Docs/List/types/index.ts`
3. **Form field:** Add to `js/src/pages/admin/Docs/Edit/tabs/Description/index.tsx`
4. **Query:** Include in `queryMeta.variables.meta_keys` array in `js/src/pages/admin/Docs/Edit/index.tsx`

### Add a New REST Endpoint
1. Add to `$apis` array: `['endpoint' => 'name', 'method' => 'get', 'permission_callback' => null]`
2. Add callback method: `public function get_name_callback(\WP_REST_Request $request): \WP_REST_Response`
3. `ApiBase` from Powerhouse auto-registers routes via `rest_api_init`

### Add a New Admin Page
1. Add resource to `js/src/resources/index.tsx`
2. Create component in `js/src/pages/admin/YourPage/`
3. Add `<Route path="your-page" element={<YourPage />} />` in `js/src/App1.tsx`

### Check Access in PHP
```php
use J7\PowerDocs\Domains\Doc\Access;
$can_access = Access::can_access($doc_top_parent_id, $user_id);
```

### Add a New PHP Template
1. Create at `inc/templates/pages/your-template/index.php`
2. Register name in `Plugin::$template_page_names` in `plugin.php`
3. Call with `Plugin::load_template('your-template', ['key' => 'value'])`
4. Access args in template with `@['key' => $key] = $args;`

---

## Key Files Quick Reference

| File | Purpose |
|---|---|
| `plugin.php` | Plugin header, required plugins declaration, `Plugin::instance()` |
| `inc/classes/Bootstrap.php` | Domain instantiation + script enqueue + env localization |
| `inc/classes/Domains/Doc/CPT.php` | `pd_doc` registration, Elementor support, cache/Elementor data cleanup |
| `inc/classes/Domains/Doc/Access.php` | Access check (`can_access`) + WooCommerce grant (`grant_access`) |
| `inc/classes/Domains/Doc/Api.php` | All Powerhouse REST filter extensions for docs |
| `inc/classes/Domains/Doc/Templates.php` | `single_template` override + admin bar "編輯知識庫" |
| `inc/classes/Domains/Doc/Utils.php` | Recursive sidebar HTML builder |
| `inc/classes/Helper/TOCGenerator.php` | PHP DOM-based TOC (headings → anchor links) |
| `inc/classes/Domains/Product/Api.php` | `bound_docs_data` meta exposure on WC products |
| `inc/classes/Domains/User/Api.php` | Custom user list with `granted_docs` SQL filter |
| `inc/templates/single-pd_doc.php` | Template dispatcher: landing / detail / search |
| `inc/templates/pages/doc-landing/index.php` | KB index: hero + child card grid |
| `inc/templates/pages/doc-detail/index.php` | 3-col detail: sider + main + TOC |
| `inc/templates/pages/doc-search/index.php` | Search results + keyword highlight |
| `js/src/main.tsx` | React app mount point |
| `js/src/App1.tsx` | Refine admin shell + HashRouter + all routes |
| `js/src/resources/index.tsx` | Refine resource definitions |
| `js/src/pages/admin/Docs/Edit/index.tsx` | KB editor with 3 tabs |
| `js/src/pages/admin/Docs/Edit/tabs/SortablePosts/index.tsx` | Drag-and-drop chapter tree |
| `js/src/pages/admin/Docs/Edit/PostEdit/index.tsx` | Chapter/article inline editor |
| `js/src/pages/admin/Docs/Edit/tabs/Description/index.tsx` | KB metadata form |
| `js/src/hooks/useEnv.tsx` | Typed access to decrypted WP-localized env vars |
| `js/src/pages/admin/Docs/List/types/index.ts` | Core TypeScript types |
| `vite.config.ts` | Vite build config (port 5175, output: `js/dist`) |
| `tailwind.config.cjs` | Tailwind + DaisyUI (`pc-` prefix, `power` theme) |
| `composer.json` | PHP deps + PSR-4 autoload config |
| `package.json` | JS scripts + deps |
