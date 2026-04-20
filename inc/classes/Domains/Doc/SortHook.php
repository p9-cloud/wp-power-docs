<?php
/**
 * SortHook — Powerhouse `posts/sort` REST endpoint 的後處理 hook
 *
 * 兩個修復責任（Phase 1-C 部分 + Phase 3）：
 *
 * 1. **更新 post_modified**（R3）：
 *    Powerhouse `CRUD::sort_posts` 用 raw SQL 批次更新 wp_posts，
 *    不會觸發 post_modified 欄位更新。Feature Rule 2 要求 post_modified
 *    必須反映本次操作時間，故在此 hook 中為受影響節點補一次 SQL UPDATE。
 *
 * 2. **清除 power-docs transient**（R3）：
 *    批次 SQL 不觸發 `save_post_pd_doc`，故
 *    `power_docs_get_children_posts_html_{top_parent_id}` transient
 *    永遠陳舊。在此 hook 精準清除 pd_doc 受影響 root 的 transient。
 *
 * 注意：
 * - Only 套用於 post_type = pd_doc 的節點（避免影響 power-course 等其他 Powerhouse 消費者）
 * - 只在 REST 回應非錯誤時執行
 * - 失敗時不阻止 REST 回應（用 log 記錄，不 throw）
 */

declare( strict_types=1 );

namespace J7\PowerDocs\Domains\Doc;

use J7\Powerhouse\Domains\Post\Utils\CRUD as PostUtils;

/**
 * Class SortHook
 */
final class SortHook {
	use \J7\WpUtils\Traits\SingletonTrait;

	/**
	 * 目標 REST 路由（Powerhouse 共用層提供）
	 *
	 * @var string
	 */
	public const TARGET_ROUTE = '/v2/powerhouse/posts/sort';

	/** Constructor */
	public function __construct() {
		// 使用 `rest_request_after_callbacks`（每次 dispatch 都觸發，含 rest_do_request()）。
		// 不用 `rest_post_dispatch`（只在真實 HTTP serve_request 時觸發，無法覆蓋 internal dispatch）。
		\add_filter( 'rest_request_after_callbacks', [ __CLASS__, 'after_sort' ], 10, 3 );
	}

	/**
	 * REST request-after-callbacks filter：在 Powerhouse `posts/sort` 成功後補做：
	 *   1. 更新受影響 pd_doc 節點的 post_modified
	 *   2. 清除受影響 root pd_doc 的 transient 快取
	 *
	 * @param \WP_REST_Response|\WP_Error|mixed $response REST response.
	 * @param array                             $handler  Route handler.
	 * @param \WP_REST_Request                  $request  Request instance.
	 *
	 * @return \WP_REST_Response|\WP_Error|mixed
	 */
	public static function after_sort( $response, $handler, $request ) {
		if ( ! ( $request instanceof \WP_REST_Request ) ) {
			return $response;
		}
		if ( self::TARGET_ROUTE !== $request->get_route() ) {
			return $response;
		}

		// 僅在回應非錯誤時處理
		if ( $response instanceof \WP_Error ) {
			return $response;
		}
		if ( is_object( $response ) && method_exists( $response, 'is_error' ) && $response->is_error() ) {
			return $response;
		}

		$body    = $request->get_json_params();
		$to_tree = isset( $body['to_tree'] ) && is_array( $body['to_tree'] ) ? $body['to_tree'] : [];
		if ( empty( $to_tree ) ) {
			return $response;
		}

		// 收集受影響的 pd_doc 節點 ID 與 root ID
		$affected_pd_doc_ids = [];
		$affected_root_ids   = [];
		foreach ( $to_tree as $node ) {
			if ( ! isset( $node['id'] ) ) {
				continue;
			}
			$post_id = (int) $node['id'];
			if ( $post_id <= 0 ) {
				continue;
			}

			$post_type = \get_post_type( $post_id );
			if ( CPT::POST_TYPE !== $post_type ) {
				continue;
			}

			$affected_pd_doc_ids[ $post_id ] = true;

			$top_id = PostUtils::get_top_post_id( $post_id );
			if ( $top_id > 0 ) {
				$affected_root_ids[ $top_id ] = true;
			}
		}

		if ( empty( $affected_pd_doc_ids ) ) {
			return $response;
		}

		// 修復 1：更新 post_modified（補 SQL raw update 不觸發的欄位）
		self::touch_post_modified( array_keys( $affected_pd_doc_ids ) );

		// 修復 2：清除 power-docs root transient（批次 SQL 繞過 save_post hook）
		foreach ( array_keys( $affected_root_ids ) as $root_id ) {
			\delete_transient( Utils::get_cache_key( $root_id ) );
		}

		return $response;
	}

	/**
	 * 為指定節點更新 post_modified 到當前時間（GMT + local）。
	 *
	 * 使用 raw SQL UPDATE + `clean_post_cache()` 搭配，避免觸發 `save_post_pd_doc`
	 * 再次進入本 hook 連動造成副作用（例如 Elementor data 清除）。
	 *
	 * @param array<int, int> $post_ids 受影響的 post_id 陣列（已確認為 pd_doc）。
	 */
	private static function touch_post_modified( array $post_ids ): void {
		if ( empty( $post_ids ) ) {
			return;
		}

		global $wpdb;

		$now_local = \current_time( 'mysql', 0 );
		$now_gmt   = \current_time( 'mysql', 1 );

		// $post_ids 已在呼叫端強轉 int，組成 IN 子句相對安全；
		// 以 esc_sql + implode 組 ID 列，避免 PHPCS 對可變數量 prepare placeholders 的誤判。
		$safe_ids = implode( ',', array_map( 'intval', $post_ids ) );

		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$wpdb->query(
			$wpdb->prepare(
				"UPDATE {$wpdb->posts} SET post_modified = %s, post_modified_gmt = %s WHERE ID IN ({$safe_ids})",
				$now_local,
				$now_gmt
			)
		);
		// phpcs:enable

		// 清除 per-post object cache 確保 get_post() 拿到新 post_modified
		foreach ( $post_ids as $pid ) {
			\clean_post_cache( (int) $pid );
		}
	}
}
