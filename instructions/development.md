# Power Docs — Development Workflow & Setup Guide

> **📁 Intended location:** `instructions/development.md`
> **Last Updated:** 2025-01-01

---

## Initial Setup

### Prerequisites

| Tool | Version | Check |
|---|---|---|
| PHP | 8.0+ | `php -v` |
| Composer | latest | `composer -V` |
| Node.js | 18+ | `node -v` |
| pnpm | 8+ | `pnpm -v` |
| WordPress | 5.7+ | — |
| WooCommerce | 7.6.0+ | — |
| Powerhouse plugin | 3.3.11+ | — |

### First-Time Setup

```bash
# 1. Install JS dependencies
pnpm install

# 2. Install PHP dependencies
composer install

# 4. Copy plugin to WordPress
# Either symlink or use DDEV/LocalWP plugin directory

# 5. Activate in WordPress:
#    - WooCommerce
#    - Powerhouse
#    - Power Docs
```

### WordPress Local Dev Config

In `wp-config.php`:
```php
define('WP_ENVIRONMENT_TYPE', 'local'); // enables local dev features
define('WP_DEBUG', true);
define('WP_DEBUG_LOG', true);
define('WP_DEBUG_DISPLAY', false);
```

When `WP_ENVIRONMENT_TYPE === 'local'`:
- `Plugin::$is_local = true`
- CPT admin menus become visible
- Admin bar and nav menus show `pd_doc` items

---

## Development Workflow

### Daily Development

```bash
# Terminal 1: Start Vite dev server
pnpm dev
# Server starts at http://localhost:5175

# Terminal 2: Watch PHP (optional, if using IDE)
# PhpStorm auto-detects phpcs.xml

# Then develop in your WordPress site
# React changes hot-reload via Vite HMR
# PHP changes require page refresh
```

### Working with the Admin Panel

1. Open WordPress admin: `wp-admin/admin.php?page=power-docs`
2. The React app mounts into `#power_docs` div
3. Navigate using the left sidebar (HashRouter, so URL shows `#/docs`, `#/users`, etc.)

### Working with Frontend Templates

PHP templates in `inc/templates/pages/` render on the public-facing site when visiting `pd_doc` posts.

Test by:
1. Creating a knowledge base in the admin panel
2. Publishing it
3. Visiting the frontend URL shown in "前往知識庫" button

---

## Code Quality Checks

### JavaScript/TypeScript

```bash
# Lint check
pnpm lint

# Auto-fix
pnpm lint:fix

# Format with Prettier
pnpm format
```

Config files:
- `.eslintrc.cjs` — ESLint config
- `.prettierrc` — Prettier config

### PHP

```bash
# Run PHPCS (check only)
composer lint
# or
vendor/bin/phpcs

# Auto-fix
vendor/bin/phpcbf
```

Config files:
- `phpcs.xml` — PHPCS rules (WordPress coding standards)
- `phpstan.neon` — PHPStan static analysis config

```bash
# PHPStan analysis
vendor/bin/phpstan analyse
```

---

## Release Process

### Version Bump & Release

```bash
# Patch release (1.2.x → 1.2.x+1)
pnpm release:patch

# Minor release (1.x.0)
pnpm release:minor

# Major release (x.0.0)
pnpm release:major
```

The release script (`.release-it.cjs`) will:
1. Build the frontend (`pnpm build`)
2. Bump version in `package.json`
3. Sync version to `plugin.php` header
4. Create git tag
5. Push to GitHub
6. Create GitHub Release with zip attachment

### Build Only (No Release)

```bash
pnpm release:build-only
```

### Manual Zip

```bash
pnpm zip
```

Creates `release/power-docs.zip` for manual distribution.

### Version Sync Only

```bash
pnpm sync:version
# Reads version from package.json → updates "Version: X.X.X" in plugin.php
```

---

## Internationalization (i18n)

Text domain: `power_docs`

```bash
# Generate .pot file
pnpm i18n
# Creates: languages/power_docs.pot

# Generate and commit
pnpm i18n:commit
# Runs i18n, then git add . && git commit --amend --no-edit
```

### PHP i18n

```php
\esc_html__('Text to translate', 'power_docs')
\__('Text', 'power_docs')
\esc_html_e('Echo translated text', 'power_docs')
```

### TypeScript i18n

Currently, the admin panel uses Chinese text directly (not i18n'd via WP). If needed, use `antd`'s `ConfigProvider` with Chinese locale.

---

## Debugging

### PHP Errors

```php
// WooCommerce error log (viewable at WooCommerce → Status → Logs)
\J7\WpUtils\Classes\WC::log($message, 'context');

// Standard WP debug (goes to wp-content/debug.log)
\error_log('My debug: ' . print_r($data, true));
```

### JavaScript Errors

- React Query DevTools available in dev mode (bottom-right of admin panel)
- Browser DevTools → Network tab to inspect API calls
- `console.log()` freely in development

### Common Issues

| Issue | Solution |
|---|---|
| Admin panel blank | Check browser console for JS errors; verify Vite dev server is running |
| REST API 401 errors | Check nonce is being sent via `AXIOS_INSTANCE` |
| Templates not loading | Run `flush_rewrite_rules()` or visit Settings → Permalinks |
| `pd_doc` not visible in admin | Set `WP_ENVIRONMENT_TYPE=local` or check `$is_local` |
| Elementor widgets missing | Ensure Elementor is active; check `Elementor\Loader::is_elementor_enabled()` |
| Access not granted | Check `ph_access_itemmeta` table; verify `bound_docs_data` on product |

---

## Project Files Reference

### Configuration Files

| File | Purpose |
|---|---|
| `composer.json` | PHP deps, PSR-4 autoload, `composer lint` script |
| `package.json` | JS deps, all `pnpm` scripts |
| `vite.config.ts` | Vite build: port 5175, entry `js/src/main.tsx`, output `js/dist` |
| `tailwind.config.cjs` | TailwindCSS + DaisyUI config (theme: `power`, prefix: `pc-`) |
| `tsconfig.json` | TypeScript config, paths |
| `phpcs.xml` | WordPress coding standards configuration |
| `phpstan.neon` | PHPStan levels and stubs |
| `.eslintrc.cjs` | ESLint config |
| `.prettierrc` | Prettier formatting rules |

### Documentation Files

| File | Purpose |
|---|---|
| `README.md` | Project overview, features, installation, usage |
| `ARCHITECTURE.md` | Architecture diagrams, directory structure, data flow |
| `copilot-instructions.md` | Full AI development guide (→ `.github/copilot-instructions.md`) |
| `instructions-php-backend.md` | PHP backend patterns (→ `instructions/php-backend.md`) |
| `instructions-frontend.md` | Frontend patterns (→ `instructions/frontend.md`) |
| `instructions-development.md` | This file — setup & workflow (→ `instructions/development.md`) |

### Setting Up Proper Documentation Directories

To move documentation to their intended locations:

```bash
# Create .github directory and place copilot instructions
mkdir .github
move copilot-instructions.md .github\copilot-instructions.md

# Create instructions directory
mkdir instructions
move instructions-php-backend.md instructions\php-backend.md
move instructions-frontend.md instructions\frontend.md
move instructions-development.md instructions\development.md
```

---

## Environment Variables Reference

These are passed from PHP via `wp_localize_script` (encrypted):

| Variable | Value | PHP Source |
|---|---|---|
| `SITE_URL` | `https://example.com` | `site_url()` |
| `API_URL` | `https://example.com/wp-json` | `rest_url()` |
| `CURRENT_USER_ID` | `123` | `get_current_user_id()` |
| `CURRENT_POST_ID` | `456` | `get_the_ID()` |
| `APP_NAME` | `Power Docs` | `Plugin::$app_name` |
| `KEBAB` | `power-docs` | `Plugin::$kebab` |
| `SNAKE` | `power_docs` | `Plugin::$snake` |
| `NONCE` | `abc123` | `wp_create_nonce('wp_rest')` |
| `APP1_SELECTOR` | `#power_docs` | `Base::APP1_SELECTOR` |
| `DOCS_POST_TYPE` | `pd_doc` | `CPT::POST_TYPE` |
| `BOUND_META_KEY` | `bound_docs_data` | `Product\Api::BOUND_META_KEY` |
| `BUNNY_LIBRARY_ID` | — | Powerhouse Settings |
| `BUNNY_CDN_HOSTNAME` | — | Powerhouse Settings |
| `BUNNY_STREAM_API_KEY` | — | Powerhouse Settings |
| `ELEMENTOR_ENABLED` | `true/false` | checks active_plugins |
