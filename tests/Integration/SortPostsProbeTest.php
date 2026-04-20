<?php
/**
 * SortPosts Probe 測試（Phase 0 — 根因層級決策）
 *
 * 目的：在修任何東西之前，先用真實 SQL 查詢確認 Powerhouse `CRUD::sort_posts`
 * 的資料庫寫入狀態，決定後續修復層級（Layer A 前端 / Layer B1 快取 / Layer B2 SQL 寫入）。
 *
 * 對應規格：
 * - specs/features/sortable-posts/知識庫章節拖拽排序.feature Rule 2
 * - specs/plans/sortable-posts-sort-fix-plan.md Phase 0
 *
 * 每個 test method 對應 plan 的 Probe-1 ~ Probe-5。
 *
 * @group smoke
 * @group sort-probe
 */

declare( strict_types=1 );

namespace Tests\PowerDocs\Integration;

use J7\PowerDocs\Domains\Doc\CPT;
use J7\PowerDocs\Domains\Doc\Utils;
use J7\Powerhouse\Domains\Post\Utils\CRUD as PostUtils;

/**
 * Class SortPostsProbeTest
 *
 * 將 Feature Background 的節點樹以 fixture 建立，
 * 呼叫 Powerhouse `CRUD::sort_posts`，然後對 `wp_posts` 執行 SQL SELECT
 * 驗證五個斷言：menu_order / post_parent / post_modified / post_status / transient。
 */
class SortPostsProbeTest extends TestCase {

	/**
	 * Feature Background 對應的節點 ID 對照
	 *
	 * @var array<string, int>
	 */
	private array $node_ids = [];

	/**
	 * set_up 前的基準時間（用於驗證 post_modified）
	 *
	 * @var string
	 */
	private string $before_sort_datetime = '';

	/**
	 * 建立 Feature Background 節點樹
	 *
	 * 規格要求：
	 * - 1 個 root（知識庫 A）
	 * - 3 個章節（章節一/二/三），post_parent = root, menu_order = 0/1/2
	 * - 2 個單元（單元 1-1 / 1-2），post_parent = 章節一
	 * - 1 個單元（單元 2-1），post_parent = 章節二
	 *
	 * 為避免 MariaDB second-level 時間精度誤差，建立後睡 2 秒再驗 post_modified。
	 */
	public function set_up(): void {
		parent::set_up();

		$this->node_ids['root']      = $this->create_doc(
			[
				'post_title'  => '知識庫 A',
				'menu_order'  => 0,
			]
		);
		$this->node_ids['chapter_1'] = $this->create_nested_doc(
			$this->node_ids['root'],
			[
				'post_title'  => '章節一',
				'menu_order'  => 0,
			]
		);
		$this->node_ids['chapter_2'] = $this->create_nested_doc(
			$this->node_ids['root'],
			[
				'post_title'  => '章節二',
				'menu_order'  => 1,
			]
		);
		$this->node_ids['chapter_3'] = $this->create_nested_doc(
			$this->node_ids['root'],
			[
				'post_title'  => '章節三',
				'menu_order'  => 2,
			]
		);
		$this->node_ids['unit_1_1'] = $this->create_nested_doc(
			$this->node_ids['chapter_1'],
			[
				'post_title' => '單元 1-1',
				'menu_order' => 0,
			]
		);
		$this->node_ids['unit_1_2'] = $this->create_nested_doc(
			$this->node_ids['chapter_1'],
			[
				'post_title' => '單元 1-2',
				'menu_order' => 1,
			]
		);
		$this->node_ids['unit_2_1'] = $this->create_nested_doc(
			$this->node_ids['chapter_2'],
			[
				'post_title' => '單元 2-1',
				'menu_order' => 0,
			]
		);

		// 記錄排序前的基準時間，等 >= 1 秒確保 post_modified 時間差可辨識
		$this->before_sort_datetime = \current_time( 'mysql' );
		sleep( 1 );
	}

	/**
	 * @test
	 * @group smoke
	 *
	 * Probe-1 / Probe-2：同層級重排後，wp_posts.menu_order 應正確寫入。
	 *
	 * Feature Rule 2 Example 1：
	 *   把「章節一」(menu_order=0) 拖到「章節三」之後
	 *   預期 {chapter_1: 2, chapter_2: 0, chapter_3: 1}
	 */
	public function test_Probe2_同層級重排後_menu_order_正確寫入wp_posts(): void {
		$root      = $this->node_ids['root'];
		$chapter_1 = $this->node_ids['chapter_1'];
		$chapter_2 = $this->node_ids['chapter_2'];
		$chapter_3 = $this->node_ids['chapter_3'];

		$from_tree = [
			[ 'id' => (string) $chapter_1, 'depth' => 0, 'menu_order' => 0, 'parent_id' => (string) $root ],
			[ 'id' => (string) $chapter_2, 'depth' => 0, 'menu_order' => 1, 'parent_id' => (string) $root ],
			[ 'id' => (string) $chapter_3, 'depth' => 0, 'menu_order' => 2, 'parent_id' => (string) $root ],
		];
		$to_tree   = [
			[ 'id' => (string) $chapter_2, 'depth' => 0, 'menu_order' => 0, 'parent_id' => (string) $root ],
			[ 'id' => (string) $chapter_3, 'depth' => 0, 'menu_order' => 1, 'parent_id' => (string) $root ],
			[ 'id' => (string) $chapter_1, 'depth' => 0, 'menu_order' => 2, 'parent_id' => (string) $root ],
		];

		$result = PostUtils::sort_posts(
			[
				'from_tree' => $from_tree,
				'to_tree'   => $to_tree,
			]
		);

		$this->assertTrue( $result === true, '[Probe-2] sort_posts 應回傳 true' );

		global $wpdb;
		// 直接查 DB，繞過 object cache，以真實 SQL 結果為準
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT ID, post_parent, menu_order, post_status FROM {$wpdb->posts} WHERE ID IN (%d, %d, %d) ORDER BY ID ASC",
				$chapter_1,
				$chapter_2,
				$chapter_3
			),
			ARRAY_A
		);

		$by_id = [];
		foreach ( $rows as $row ) {
			$by_id[ (int) $row['ID'] ] = $row;
		}

		$this->assertSame( 2, (int) $by_id[ $chapter_1 ]['menu_order'], '[Probe-2] 章節一 menu_order 應為 2' );
		$this->assertSame( 0, (int) $by_id[ $chapter_2 ]['menu_order'], '[Probe-2] 章節二 menu_order 應為 0' );
		$this->assertSame( 1, (int) $by_id[ $chapter_3 ]['menu_order'], '[Probe-2] 章節三 menu_order 應為 1' );

		$this->assertSame( $root, (int) $by_id[ $chapter_1 ]['post_parent'], '[Probe-2] 章節一 post_parent 應仍指向 root' );
		$this->assertSame( $root, (int) $by_id[ $chapter_2 ]['post_parent'], '[Probe-2] 章節二 post_parent 應仍指向 root' );
		$this->assertSame( $root, (int) $by_id[ $chapter_3 ]['post_parent'], '[Probe-2] 章節三 post_parent 應仍指向 root' );

		// R6 誤刪驗證：三個節點都不應被 trash
		$this->assertSame( 'publish', $by_id[ $chapter_1 ]['post_status'], '[Probe-2][R6] 章節一不應被誤刪' );
		$this->assertSame( 'publish', $by_id[ $chapter_2 ]['post_status'], '[Probe-2][R6] 章節二不應被誤刪' );
		$this->assertSame( 'publish', $by_id[ $chapter_3 ]['post_status'], '[Probe-2][R6] 章節三不應被誤刪' );
	}

	/**
	 * @test
	 * @group smoke
	 *
	 * Probe-2-post_modified（透過 REST）：同層級重排後，受影響節點的 post_modified 應被更新。
	 *
	 * 對應 Feature Rule 2 Example 1 的斷言：「id = 101、102、103 的 post_modified 欄位應被更新為本次操作時間」。
	 *
	 * 驗證 R3：Powerhouse `CRUD::sort_posts` 的 raw SQL UPDATE 不會更新 post_modified，
	 * 需由 power-docs 的 `SortHook::after_sort`（rest_post_dispatch filter）補齊。
	 * 故本測試**走 REST 路徑**（真實前端行為），才能觸發 SortHook。
	 */
	public function test_Probe2_同層級重排後_post_modified_被更新(): void {
		$root      = $this->node_ids['root'];
		$chapter_1 = $this->node_ids['chapter_1'];
		$chapter_2 = $this->node_ids['chapter_2'];
		$chapter_3 = $this->node_ids['chapter_3'];

		$to_tree = [
			[ 'id' => (string) $chapter_2, 'depth' => 0, 'menu_order' => 0, 'parent_id' => (string) $root ],
			[ 'id' => (string) $chapter_3, 'depth' => 0, 'menu_order' => 1, 'parent_id' => (string) $root ],
			[ 'id' => (string) $chapter_1, 'depth' => 0, 'menu_order' => 2, 'parent_id' => (string) $root ],
		];

		$this->dispatch_sort_via_rest( $to_tree, $to_tree );

		global $wpdb;
		$modifieds = $wpdb->get_col(
			$wpdb->prepare(
				"SELECT post_modified FROM {$wpdb->posts} WHERE ID IN (%d, %d, %d)",
				$chapter_1,
				$chapter_2,
				$chapter_3
			)
		);

		foreach ( $modifieds as $modified ) {
			$this->assertGreaterThan(
				$this->before_sort_datetime,
				(string) $modified,
				"[Probe-2][R3] post_modified 應大於 {$this->before_sort_datetime}，實際：{$modified}"
			);
		}
	}

	/**
	 * @test
	 * @group smoke
	 *
	 * Probe-3：跨層級移動後，wp_posts.post_parent + menu_order 應同步更新。
	 *
	 * Feature Rule 2 Example 2：單元 2-1 從章節二拖到章節一之下第 3 位。
	 *   預期 unit_2_1.post_parent = chapter_1, menu_order = 2
	 */
	public function test_Probe3_跨層級移動後_post_parent_和menu_order同步寫入(): void {
		$root      = $this->node_ids['root'];
		$chapter_1 = $this->node_ids['chapter_1'];
		$chapter_2 = $this->node_ids['chapter_2'];
		$unit_1_1  = $this->node_ids['unit_1_1'];
		$unit_1_2  = $this->node_ids['unit_1_2'];
		$unit_2_1  = $this->node_ids['unit_2_1'];

		$to_tree = [
			// 章節一 + 其子節點（新增 unit_2_1 為第 3 個子節點）
			[ 'id' => (string) $chapter_1, 'depth' => 0, 'menu_order' => 0, 'parent_id' => (string) $root ],
			[ 'id' => (string) $unit_1_1,  'depth' => 1, 'menu_order' => 0, 'parent_id' => (string) $chapter_1 ],
			[ 'id' => (string) $unit_1_2,  'depth' => 1, 'menu_order' => 1, 'parent_id' => (string) $chapter_1 ],
			[ 'id' => (string) $unit_2_1,  'depth' => 1, 'menu_order' => 2, 'parent_id' => (string) $chapter_1 ],
			// 章節二（空了）
			[ 'id' => (string) $chapter_2, 'depth' => 0, 'menu_order' => 1, 'parent_id' => (string) $root ],
		];

		PostUtils::sort_posts(
			[
				'from_tree' => $to_tree,
				'to_tree'   => $to_tree,
			]
		);

		global $wpdb;
		$row = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT ID, post_parent, menu_order, post_status FROM {$wpdb->posts} WHERE ID = %d",
				$unit_2_1
			),
			ARRAY_A
		);

		$this->assertNotNull( $row, '[Probe-3] unit_2_1 應仍存在於 wp_posts' );
		$this->assertSame( $chapter_1, (int) $row['post_parent'], '[Probe-3] unit_2_1.post_parent 應改為 chapter_1' );
		$this->assertSame( 2, (int) $row['menu_order'], '[Probe-3] unit_2_1.menu_order 應為 2' );
		$this->assertSame( 'publish', $row['post_status'], '[Probe-3][R6] unit_2_1 不應被誤刪' );
	}

	/**
	 * @test
	 * @group smoke
	 *
	 * Probe-4：sort_posts 完成後，`get_post()` 回傳的內容應與 DB 一致（object cache 有被清）。
	 *
	 * 驗證 R2：如果 `wp_cache_flush_group('posts')` 在 Redis 環境下無效，
	 * get_post() 會回傳 stale 資料，此測試會紅燈，指向 Phase 1-B（cache flush 修復）。
	 */
	public function test_Probe4_sort_posts後_get_post回傳最新資料_無stale_cache(): void {
		$root      = $this->node_ids['root'];
		$chapter_1 = $this->node_ids['chapter_1'];
		$chapter_2 = $this->node_ids['chapter_2'];
		$chapter_3 = $this->node_ids['chapter_3'];

		// 先把 chapter_1 塞進 object cache
		\get_post( $chapter_1 );

		$to_tree = [
			[ 'id' => (string) $chapter_2, 'depth' => 0, 'menu_order' => 0, 'parent_id' => (string) $root ],
			[ 'id' => (string) $chapter_3, 'depth' => 0, 'menu_order' => 1, 'parent_id' => (string) $root ],
			[ 'id' => (string) $chapter_1, 'depth' => 0, 'menu_order' => 2, 'parent_id' => (string) $root ],
		];

		PostUtils::sort_posts(
			[
				'from_tree' => $to_tree,
				'to_tree'   => $to_tree,
			]
		);

		// 不 flush，直接 get_post；若 cache flush 有效，應拿到新值
		$post_after = \get_post( $chapter_1 );
		$this->assertSame(
			2,
			(int) $post_after->menu_order,
			'[Probe-4][R2] get_post 回傳的 menu_order 應為新值 2，若為 0 代表 object cache 未清'
		);

		// 對照：明確 flush 後值必須一致
		\wp_cache_flush();
		$post_fresh = \get_post( $chapter_1 );
		$this->assertSame(
			(int) $post_after->menu_order,
			(int) $post_fresh->menu_order,
			'[Probe-4] flush 前後的 get_post() 結果不一致，代表 sort_posts 沒清到 object cache（R2 成立）'
		);
	}

	/**
	 * @test
	 * @group smoke
	 *
	 * Probe-5（透過 REST）：sort 完成後，power-docs 的 `power_docs_get_children_posts_html_{root}` transient 應被清除。
	 *
	 * 驗證 R3：批次 SQL UPDATE 繞過 `save_post_pd_doc` hook，
	 * 故 power-docs 的 root sidebar HTML transient 永遠陳舊。
	 * 本測試驗 `SortHook::after_sort`（rest_post_dispatch filter）能補清 transient。
	 */
	public function test_Probe5_sort後_power_docs_transient_被清除(): void {
		$root      = $this->node_ids['root'];
		$chapter_1 = $this->node_ids['chapter_1'];
		$chapter_2 = $this->node_ids['chapter_2'];
		$chapter_3 = $this->node_ids['chapter_3'];

		$cache_key = Utils::get_cache_key( $root );

		// 模擬前台已快取 sidebar HTML
		\set_transient( $cache_key, '<ul>STALE_SIDEBAR_HTML</ul>', 3600 );
		$this->assertSame(
			'<ul>STALE_SIDEBAR_HTML</ul>',
			\get_transient( $cache_key ),
			'[Probe-5] 前提：transient 應先被設定'
		);

		$to_tree = [
			[ 'id' => (string) $chapter_2, 'depth' => 0, 'menu_order' => 0, 'parent_id' => (string) $root ],
			[ 'id' => (string) $chapter_3, 'depth' => 0, 'menu_order' => 1, 'parent_id' => (string) $root ],
			[ 'id' => (string) $chapter_1, 'depth' => 0, 'menu_order' => 2, 'parent_id' => (string) $root ],
		];

		$this->dispatch_sort_via_rest( $to_tree, $to_tree );

		$after = \get_transient( $cache_key );
		$this->assertFalse(
			$after,
			'[Probe-5][R3] transient 應在 sort 後被清除，但仍為：' . var_export( $after, true )
		);
	}

	/**
	 * @test
	 * @group smoke
	 *
	 * Probe-6（Regression）：非 pd_doc post_type 的節點，SortHook 不應誤動 power-docs transient。
	 *
	 * 迴歸風險：Powerhouse sort_posts 被 power-course 等其他外掛消費，
	 * SortHook 透過 REST filter 監聽，必須確保「只處理 pd_doc」。
	 */
	public function test_Probe6_非pd_doc節點的_sort_不影響power_docs_transient(): void {
		$root      = $this->node_ids['root'];
		$cache_key = Utils::get_cache_key( $root );

		\set_transient( $cache_key, '<ul>PD_DOC_TRANSIENT</ul>', 3600 );

		// 建立兩個非 pd_doc 的 post（模擬其他外掛的 sort 對象）
		$post_a = $this->factory()->post->create(
			[ 'post_type' => 'post', 'menu_order' => 0 ]
		);
		$post_b = $this->factory()->post->create(
			[ 'post_type' => 'post', 'menu_order' => 1 ]
		);

		$to_tree = [
			[ 'id' => (string) $post_b, 'depth' => 0, 'menu_order' => 0, 'parent_id' => '0' ],
			[ 'id' => (string) $post_a, 'depth' => 0, 'menu_order' => 1, 'parent_id' => '0' ],
		];

		$this->dispatch_sort_via_rest( $to_tree, $to_tree );

		// pd_doc 的 transient 不應被誤清
		$this->assertSame(
			'<ul>PD_DOC_TRANSIENT</ul>',
			\get_transient( $cache_key ),
			'[Probe-6] 非 pd_doc 的 sort 不應清 power-docs transient'
		);
	}

	/**
	 * 以 REST 路徑呼叫 Powerhouse `posts/sort` endpoint，模擬真實前端行為。
	 *
	 * @param array<array<string, mixed>> $from_tree from_tree payload.
	 * @param array<array<string, mixed>> $to_tree   to_tree payload.
	 * @return \WP_REST_Response
	 */
	private function dispatch_sort_via_rest( array $from_tree, array $to_tree ): \WP_REST_Response {
		// 設定 admin 身份以通過 permission_callback
		$admin = $this->factory()->user->create( [ 'role' => 'administrator' ] );
		\wp_set_current_user( $admin );

		$request = new \WP_REST_Request( 'POST', '/v2/powerhouse/posts/sort' );
		$request->set_header( 'Content-Type', 'application/json' );
		$request->set_body(
			(string) wp_json_encode(
				[
					'from_tree' => $from_tree,
					'to_tree'   => $to_tree,
				]
			)
		);

		$response = \rest_do_request( $request );

		$this->assertFalse(
			$response->is_error(),
			'[REST] sort endpoint 應成功，實際錯誤：' . wp_json_encode( $response->get_data() )
		);
		return $response;
	}
}
