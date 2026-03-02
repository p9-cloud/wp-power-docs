# Power Docs — PHP Backend Development Guide

> **📁 Intended location:** `instructions/php-backend.md`
> **Last Updated:** 2025-01-01

---

## PHP Namespace & Autoloading

All PHP classes live under the `J7\PowerDocs` namespace, autoloaded via Composer PSR-4:

```json
"autoload": {
  "psr-4": {
    "J7\\PowerDocs\\": "inc/classes/"
  }
}
```

| Namespace | Directory |
|---|---|
| `J7\PowerDocs` | `inc/classes/` |
| `J7\PowerDocs\Admin` | `inc/classes/Admin/` |
| `J7\PowerDocs\Domains\Doc` | `inc/classes/Domains/Doc/` |
| `J7\PowerDocs\Domains\Product` | `inc/classes/Domains/Product/` |
| `J7\PowerDocs\Domains\User` | `inc/classes/Domains/User/` |
| `J7\PowerDocs\Domains\Elementor` | `inc/classes/Domains/Elementor/` |
| `J7\PowerDocs\Helper` | `inc/classes/Helper/` |
| `J7\PowerDocs\Compatibility` | `inc/classes/Compatibility/` |
| `J7\PowerDocs\Utils` | `inc/classes/Utils/` |

---

## Singleton Pattern

All classes use `SingletonTrait` from `j7-dev/wp-plugin-trait`:

```php
final class MyClass {
    use \J7\WpUtils\Traits\SingletonTrait;

    public function __construct() {
        // Register hooks here
        \add_action('init', [ $this, 'my_action' ]);
        \add_filter('some_filter', [ __CLASS__, 'my_static_filter' ], 10, 2);
    }
}

// Usage: always use ::instance(), never new MyClass()
MyClass::instance();
```

**Rules:**
- Use `[ $this, 'method' ]` for instance method callbacks
- Use `[ __CLASS__, 'method' ]` for static method callbacks (preferred for performance)
- Constructor = hook registration only
- Business logic in separate methods

---

## Plugin Trait (`PluginTrait`)

`Plugin` uses `PluginTrait` which provides static properties:

```php
Plugin::$dir        // '/var/www/html/wp-content/plugins/power-docs'
Plugin::$url        // 'https://example.com/wp-content/plugins/power-docs/'
Plugin::$kebab      // 'power-docs'
Plugin::$snake      // 'power_docs'
Plugin::$app_name   // 'Power Docs'
Plugin::$is_local   // true when WP_ENV === 'local'
```

Template loading:
```php
// Loads inc/templates/pages/doc-detail/index.php
Plugin::load_template('doc-detail');

// With variables
Plugin::load_template('doc-detail/sider', [
    'toc_html' => $toc_html,
]);

// In template, extract variables:
@['toc_html' => $toc_html] = $args;
```

---

## Adding a New Domain

1. Create directory: `inc/classes/Domains/YourDomain/`
2. Create `Loader.php`:
```php
namespace J7\PowerDocs\Domains\YourDomain;

final class Loader {
    use \J7\WpUtils\Traits\SingletonTrait;

    public function __construct() {
        Api::instance();
        // ... other classes
    }
}
```
3. Instantiate in `Bootstrap.php`:
```php
Domains\YourDomain\Loader::instance();
```

---

## REST API Pattern

Uses `ApiBase` from `j7-dev/wp-plugin-trait`. Route auto-registration from `$apis` array:

```php
final class Api extends ApiBase {
    use \J7\WpUtils\Traits\SingletonTrait;

    protected $namespace = 'power-docs';

    protected $apis = [
        [
            'endpoint'            => 'items',          // → /wp-json/power-docs/v1/items
            'method'              => 'get',
            'permission_callback' => null,             // null = public
        ],
        [
            'endpoint'            => 'items',
            'method'              => 'post',
            'permission_callback' => fn() => current_user_can('manage_options'),
        ],
        [
            'endpoint'            => 'items/(?P<id>\d+)',
            'method'              => 'patch',
            'permission_callback' => null,
        ],
    ];

    public function __construct() {
        parent::__construct(); // registers rest_api_init hook
    }

    // Callback naming: {method}_{endpoint_snake}_callback
    public function get_items_callback(\WP_REST_Request $request): \WP_REST_Response {
        $params = $request->get_query_params();
        $params = \J7\WpUtils\Classes\WP::sanitize_text_field_deep($params, false);

        $data = []; // your logic here

        return new \WP_REST_Response($data, 200);
    }

    public function post_items_callback(\WP_REST_Request $request): \WP_REST_Response {
        $body = $request->get_json_params();
        // ...
        return new \WP_REST_Response(['message' => 'Created'], 201);
    }
}
```

---

## Extending Powerhouse REST API via Filters

The Powerhouse plugin provides generic CRUD for posts, users, and products. Extend it via filters instead of writing your own endpoints:

### Expose Additional Post Meta

```php
// In Doc\Api constructor:
\add_filter('powerhouse/post/get_meta_keys_array', [ __CLASS__, 'extend_post_meta_keys' ], 10, 2);

public static function extend_post_meta_keys(array $meta_keys, \WP_Post $post): array {
    if (CPT::POST_TYPE !== $post->post_type) {
        return $meta_keys; // only process pd_doc posts
    }

    // Expose a meta key
    if (isset($meta_keys['my_field'])) {
        $meta_keys['my_field'] = \get_post_meta($post->ID, 'my_field', true) ?: '';
    }

    return $meta_keys;
}
```

**Important:** The filter only processes meta keys that are already in `$meta_keys` (declared by the frontend's `meta_keys` query param). This is a whitelist pattern.

### Handle File Uploads in Post Updates

```php
\add_filter('powerhouse/post/separator_body_params', [ __CLASS__, 'handle_file_upload' ], 10, 2);

public static function handle_file_upload(array $body_params, \WP_REST_Request $request): array {
    $image_names = ['my_image_field'];
    $file_params = $request->get_file_params();

    foreach ($image_names as $name) {
        if (isset($file_params[$name])) {
            $results = \J7\WpUtils\Classes\WP::upload_files($file_params[$name]);
            $body_params[$name] = $results[0]['id']; // store attachment ID
        }
        // 'delete' string → clear the value
        if ('delete' === ($body_params[$name] ?? '')) {
            $body_params[$name] = '';
            continue;
        }
        // Non-numeric, non-delete → no change
        if (!\is_numeric($body_params[$name])) {
            unset($body_params[$name]);
        }
    }
    return $body_params;
}
```

### Set Default Meta on Post Creation

```php
\add_filter('powerhouse/post/create_post_args', [ __CLASS__, 'add_default_meta' ], 10, 1);

public static function add_default_meta(array $args): array {
    if (CPT::POST_TYPE !== $args['post_type']) {
        return $args;
    }
    if (!isset($args['meta_input'])) {
        $args['meta_input'] = [];
    }
    $args['meta_input']['my_default_field'] = 'default_value';
    return $args;
}
```

---

## Transient Caching Pattern

```php
// Get cache key
$cache_key = Utils::get_cache_key($top_parent_id); // 'power_docs_get_children_posts_html_{id}'
// Custom key: Utils::get_cache_key($id, 'my_key') → 'power_docs_my_key_{id}'

// Try transient first
$html = \get_transient($cache_key);
if (false === $html) {
    $html = expensive_computation();
    \set_transient($cache_key, $html, DAY_IN_SECONDS);
}

// Invalidate on save
\add_action('save_post_' . CPT::POST_TYPE, function($post_id) {
    if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
    $top_parent_id = PostUtils::get_top_post_id($post_id);
    $cache_key = Utils::get_cache_key($top_parent_id);
    \delete_transient($cache_key);
}, 10, 1);
```

---

## Access Control API

### Checking Access

```php
use J7\PowerDocs\Domains\Doc\Access;

// Check if current user can access a doc (by top-level doc ID)
$can_access = Access::can_access($top_parent_id);

// Check for specific user
$can_access = Access::can_access($top_parent_id, $user_id);

// Returns true if:
// 1. need_access meta is 'no' (free access), OR
// 2. User has a non-expired expire_date in ph_access_itemmeta
```

### Granting Access

Access is granted via Powerhouse's Limit models:
```php
use J7\Powerhouse\Domains\Limit\Models\BoundItemData;

$bound_item = new BoundItemData($doc_post_id, /* expire days */ 365);
$bound_item->grant_user($user_id, $order); // writes to ph_access_itemmeta
```

### Querying Granted Items

```php
use J7\Powerhouse\Domains\Limit\Models\GrantedItems;

$granted_items = new GrantedItems($user_id);
$docs = $granted_items->get_granted_items([
    'post_type' => CPT::POST_TYPE,
]);
```

---

## Template Development

### Template Structure

```php
<?php
// inc/templates/pages/my-template/index.php

use J7\PowerDocs\Plugin;
use J7\Powerhouse\Plugin as Powerhouse;

global $post; // always declare global $post

// Extract template args
@[
    'my_var' => $my_var,
    'other'  => $other,
] = $args ?? []; // default to empty array

// Use Powerhouse templates
Powerhouse::load_template('hero');
Powerhouse::load_template('breadcrumb');
Powerhouse::load_template('card', ['post' => $child_post]);
Powerhouse::load_template('related-posts/children');
Powerhouse::load_template('related-posts/prev-next');
Powerhouse::load_template('search', ['class' => 'w-full']);
Powerhouse::load_template('pagination', ['query' => $query]);

// Use Power Docs templates
Plugin::load_template('doc-detail/sider');
```

### Inline HTML with Tailwind

PHP templates use Tailwind classes inline in HTML strings:
```php
echo /* html */ '<div class="tw-container mx-auto px-4">';
echo /* html */ '<h1 class="text-2xl font-bold mb-8">Title</h1>';
echo /* html */ '</div>';
```

The `/* html */` comment is a convention for syntax highlighting in editors.

---

## Compatibility / Migration

When the plugin is upgraded, `Compatibility::compatibility()` runs via `upgrader_process_complete`.

Add new migration code:
```php
public static function compatibility(): void {
    self::set_editor_meta_to_chapter(); // existing
    self::my_new_migration();            // your new migration
}

public static function my_new_migration(): void {
    // One-time data migration code here
    // Safe to run multiple times (idempotent)
}
```

---

## Error Logging

```php
// Log to WooCommerce log (power-docs channel)
\J7\WpUtils\Classes\WC::log($message, 'Context description');

// Example
try {
    // risky operation
} catch (\Throwable $th) {
    \J7\WpUtils\Classes\WC::log($th->getMessage(), '操作描述 context');
}
```

Logs viewable at: WooCommerce → Status → Logs → `power-docs-*.log`

---

## Code Quality

### PHPStan

```bash
vendor/bin/phpstan analyse
```

Config in `phpstan.neon`. Stubs provided for WordPress and WooCommerce.

### PHPCS (WordPress Coding Standards)

```bash
vendor/bin/phpcs        # Check
vendor/bin/phpcbf       # Auto-fix
```

Config in `phpcs.xml`.

### Common Issues to Avoid

- Always `declare(strict_types=1);` at the top of each file
- Use `\` prefix for global functions when inside a namespace: `\add_action()`, `\get_post_meta()`, etc.
- Use `\WP_Post` not `WP_Post` in namespaced files (or import with `use WP_Post`)
- Sanitize all user input: `\sanitize_text_field()`, `\absint()`, `\esc_url_raw()`
- Escape all output: `\esc_html()`, `\esc_attr()`, `\esc_url()`
- Prepare all raw SQL: `$wpdb->prepare()`
