---
globs:
  - "inc/**/*.php"
  - "plugin.php"
  - "composer.json"
  - "phpcs.xml"
  - "phpstan.neon"
---

# PHP Backend Rules

## Namespace & Autoload

```
J7\PowerDocs\           -> inc/classes/
J7\PowerDocs\Admin      -> inc/classes/Admin/
J7\PowerDocs\Domains\*  -> inc/classes/Domains/*/
J7\PowerDocs\Helper     -> inc/classes/Helper/
J7\PowerDocs\Compatibility -> inc/classes/Compatibility/
J7\PowerDocs\Utils      -> inc/classes/Utils/
```

## Singleton Pattern（強制）

所有類別使用 `SingletonTrait`，禁止 `new ClassName()`：

```php
final class MyClass {
    use \J7\WpUtils\Traits\SingletonTrait;
    public function __construct() {
        // 僅在此註冊 hooks
        \add_action('init', [ $this, 'my_action' ]);
        \add_filter('some_filter', [ __CLASS__, 'my_static_filter' ], 10, 2);
    }
}
// 使用: MyClass::instance();
```

- instance method callback: `[ $this, 'method' ]`
- static method callback: `[ __CLASS__, 'method' ]`（效能較佳）
- constructor = hook 註冊，業務邏輯放其他方法

## PluginTrait 靜態屬性

```php
Plugin::$dir        // 外掛絕對路徑
Plugin::$url        // 外掛 URL
Plugin::$kebab      // 'power-docs'
Plugin::$snake      // 'power_docs'
Plugin::$app_name   // 'Power Docs'
Plugin::$is_local   // WP_ENVIRONMENT_TYPE === 'local'
Plugin::load_template('doc-detail', ['key' => 'value']);
```

## 擴展 Powerhouse REST API（優先使用 filter）

### 暴露 Meta
```php
\add_filter('powerhouse/post/get_meta_keys_array', [ __CLASS__, 'extend_meta' ], 10, 2);
public static function extend_meta(array $meta_keys, \WP_Post $post): array {
    if (CPT::POST_TYPE !== $post->post_type) return $meta_keys;
    if (isset($meta_keys['my_field'])) {
        $meta_keys['my_field'] = \get_post_meta($post->ID, 'my_field', true) ?: '';
    }
    return $meta_keys;
}
```
**注意**: filter 只處理前端 `meta_keys` query param 中宣告的 key（白名單機制）。

### 自建端點
繼承 `ApiBase`，在 `$apis` 陣列定義，callback 命名為 `{method}_{endpoint_snake}_callback`。

## 模板開發

```php
// inc/templates/pages/my-template/index.php
global $post;
@['my_var' => $my_var] = $args ?? [];

// 使用 Powerhouse 模板
Powerhouse::load_template('hero');
Powerhouse::load_template('card', ['post' => $child_post]);
Powerhouse::load_template('pagination', ['query' => $query]);

// 使用 Power Docs 模板
Plugin::load_template('doc-detail/sider');
```

PHP 模板中的 Tailwind：用 `/* html */` 註解輔助語法高亮：
```php
echo /* html */ '<div class="tw-container mx-auto px-4">';
```

## Transient 快取

```php
$cache_key = Utils::get_cache_key($top_parent_id); // 'power_docs_get_children_posts_html_{id}'
// 自訂: Utils::get_cache_key($id, 'my_key') -> 'power_docs_my_key_{id}'

// 清除時必須防止 autosave
if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
$top_parent_id = PostUtils::get_top_post_id($post_id);
\delete_transient(Utils::get_cache_key($top_parent_id));
```

## 存取控制

```php
use J7\PowerDocs\Domains\Doc\Access;
$can_access = Access::can_access($doc_top_parent_id, $user_id);

// 授權
use J7\Powerhouse\Domains\Limit\Models\BoundItemData;
$bound_item = new BoundItemData($doc_post_id, 365);
$bound_item->grant_user($user_id, $order);

// 查詢已授權項目
use J7\Powerhouse\Domains\Limit\Models\GrantedItems;
$granted_items = new GrantedItems($user_id);
$docs = $granted_items->get_granted_items(['post_type' => CPT::POST_TYPE]);
```

## 版本遷移

在 `Compatibility::compatibility()` 中新增遷移方法（需冪等）：
```php
public static function compatibility(): void {
    self::set_editor_meta_to_chapter(); // 現有
    self::my_new_migration();           // 新增
}
```

## 程式碼規範

- 每個檔案頂部：`declare(strict_types=1);`
- 全域函式加 `\` 前綴：`\add_action()`, `\get_post_meta()`
- 全域類別加 `\`：`\WP_Post`, `\WP_REST_Request`
- 輸入清理：`\sanitize_text_field()`, `\absint()`, `\esc_url_raw()`
- 輸出跳脫：`\esc_html()`, `\esc_attr()`, `\esc_url()`
- SQL 準備：`$wpdb->prepare()`
- 錯誤記錄：`\J7\WpUtils\Classes\WC::log($msg, 'context')`

## 檔案上傳 Pattern

```php
// powerhouse/post/separator_body_params filter
$image_names = ['bg_images'];
// file -> WP::upload_files() -> store attachment ID
// 'delete' -> clear meta
// non-numeric, non-delete -> unset (no change)
```

## 新增 Domain

1. 建立 `inc/classes/Domains/MyDomain/Loader.php`
2. 在 `Bootstrap.php` constructor 中 `Domains\MyDomain\Loader::instance();`
