<?php

declare( strict_types=1 );

namespace J7\PowerDocs\Domains\Doc;

/**
 * Class Loader
 */
final class Loader {
	use \J7\WpUtils\Traits\SingletonTrait;

	/**
	 * Constructor
	 */
	public function __construct() {
		Templates::instance();
		Api::instance();
		Access::instance();
		CPT::instance();
		SortHook::instance();
	}
}
