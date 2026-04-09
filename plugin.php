<?php
/**
 * Plugin Name:       Power Docs | WordPress 最好的知識變現套件
 * Plugin URI:        https://github.com/zenbuapps/power-docs
 * Description:       輕鬆做出豐富的知識庫頁面，以及輕鬆管理你的知識訂閱客戶
 * Version:           1.2.10
 * Requires at least: 5.7
 * Requires PHP:      8.0
 * Author:            J7
 * Author URI:        https://github.com/j7-dev
 * License:           GPL v2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       power_docs
 * Domain Path:       /languages
 * Tags:              document, knowledge,knowledge management system, power-docs
 */

declare (strict_types = 1);

namespace J7\PowerDocs;

if (!defined('ABSPATH')) {
	exit; // Exit if accessed directly
}

if ( \class_exists( 'J7\PowerDocs\Plugin' ) ) {
	return;
}
require_once __DIR__ . '/vendor/autoload.php';

/** Class Plugin */
final class Plugin {
	use \J7\WpUtils\Traits\PluginTrait;
	use \J7\WpUtils\Traits\SingletonTrait;

	/**
	 * 是否為本地開發環境
	 *
	 * @var bool
	 */
	public static $is_local = false;

	/**
	 * Constructor
	 */
	public function __construct() {

		self::$is_local = 'local' === \wp_get_environment_type();

		self::$template_page_names = [ 'doc-landing', 'doc-detail', 'doc-search' ];

		$this->required_plugins = [
			[
				'name'     => 'WooCommerce',
				'slug'     => 'woocommerce',
				'required' => true,
				'version'  => '7.6.0',
			],
			[
				'name'     => 'Powerhouse',
				'slug'     => 'powerhouse',
				'source'   => 'https://github.com/zenbuapps/wp-powerhouse/releases/latest/download/powerhouse.zip',
				'version'  => '3.3.11',
				'required' => true,
			],
		];

		$this->init(
			[
				'app_name'    => 'Power Docs',
				'github_repo' => 'https://github.com/zenbuapps/wp-power-docs',
				'callback'    => [ Bootstrap::class, 'instance' ],
			]
		);
	}
}

Plugin::instance();
