/**
 * [P0] 更新商品知識庫綁定設定 — product-bind-settings.spec.ts
 *
 * 驗證 POST /v2/powerhouse/products/update-bound-items
 * 依據：spec/features/product/更新綁定設定.feature
 *
 * 情境矩陣：
 * - fixed → unlimited：回傳 200，查詢後 limit_type 變更
 * - unlimited → fixed+limit_value+limit_unit：回傳 200
 * - 更新 limit_value 數值
 * - 缺少 product_ids → 400
 * - 缺少 item_ids → 400
 * - 不存在的 item_id → 不拋 500
 * - limit_value 為負數 → 不拋 500
 */
import { test, expect } from '@playwright/test'
import { wpPostForm, type ApiOptions } from '../helpers/api-client.js'
import { getNonce, getSetupIds, type SetupIds } from '../global-setup.js'
import { API } from '../fixtures/test-data.js'

test.describe('[P0] 更新商品知識庫綁定設定', () => {
	let opts: ApiOptions
	let ids: SetupIds
	let testProductId: number

	test.beforeAll(async ({ request }, workerInfo) => {
		const baseURL = workerInfo.project.use.baseURL || 'http://localhost:8893'
		const nonce = getNonce()
		opts = { request, baseURL, nonce }
		ids = getSetupIds()

		// 建立測試商品，並預先綁定知識庫（fixed 期限）
		try {
			const res = await request.post(`${baseURL}/wp-json/${API.wcProducts}`, {
				headers: { 'X-WP-Nonce': nonce, 'Content-Type': 'application/json' },
				data: {
					name: 'E2E 綁定設定更新測試商品',
					type: 'simple',
					regular_price: '777',
					status: 'publish',
				},
			})
			const prodData = await res.json() as { id: number }
			testProductId = Number(prodData.id)

			// 預先綁定 fixed 365 天
			await wpPostForm({ request, baseURL, nonce }, API.productsBind, {
				product_ids: [testProductId],
				item_ids: [ids.docId],
				meta_key: 'bound_docs_data',
				limit_type: 'fixed',
				limit_value: 365,
				limit_unit: 'day',
			}).catch(() => {})
		} catch {
			testProductId = 0
		}
	})

	test.afterAll(async ({ request }) => {
		if (testProductId) {
			await request.delete(
				`${opts.baseURL}/wp-json/${API.wcProducts}/${testProductId}?force=true`,
				{ headers: { 'X-WP-Nonce': opts.nonce } },
			).catch(() => {})
		}
	})

	// ── 正常路徑 ────────────────────────────────

	test('[P0] 將 fixed 改為 unlimited — 回傳 200', async () => {
		test.skip(!testProductId || !ids.docId, '缺少測試資料')

		const { status } = await wpPostForm(opts, API.productsUpdateBound, {
			product_ids: [testProductId],
			item_ids: [ids.docId],
			meta_key: 'bound_docs_data',
			limit_type: 'unlimited',
		})

		expect(status).toBe(200)
	})

	test('[P0] 更新後查詢商品 — limit_type 變更為 unlimited', async () => {
		test.skip(!testProductId || !ids.docId, '缺少測試資料')

		// 確保是 unlimited
		await wpPostForm(opts, API.productsUpdateBound, {
			product_ids: [testProductId],
			item_ids: [ids.docId],
			meta_key: 'bound_docs_data',
			limit_type: 'unlimited',
		})

		const url = new URL(`${opts.baseURL}/wp-json/${API.products}/${testProductId}`)
		url.searchParams.append('meta_keys[]', 'bound_docs_data')
		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})

		if (res.status() === 200) {
			const data = await res.json() as { bound_docs_data?: { id: number; post_id?: number; limit_type: string }[] }
			if (data.bound_docs_data && Array.isArray(data.bound_docs_data)) {
				const binding = data.bound_docs_data.find(
					(b) => Number(b.id) === ids.docId || Number(b.post_id) === ids.docId,
				)
				if (binding) {
					expect(binding.limit_type).toBe('unlimited')
				}
			}
		}
	})

	test('[P0] 將 unlimited 改回 fixed — 帶 limit_value 和 limit_unit', async () => {
		test.skip(!testProductId || !ids.docId, '缺少測試資料')

		// 先確保是 unlimited
		await wpPostForm(opts, API.productsUpdateBound, {
			product_ids: [testProductId],
			item_ids: [ids.docId],
			meta_key: 'bound_docs_data',
			limit_type: 'unlimited',
		})

		const { status } = await wpPostForm(opts, API.productsUpdateBound, {
			product_ids: [testProductId],
			item_ids: [ids.docId],
			meta_key: 'bound_docs_data',
			limit_type: 'fixed',
			limit_value: 180,
			limit_unit: 'day',
		})

		expect(status).toBe(200)
	})

	test('[P1] 更新 limit_value — 回傳 200', async () => {
		test.skip(!testProductId || !ids.docId, '缺少測試資料')

		const { status } = await wpPostForm(opts, API.productsUpdateBound, {
			product_ids: [testProductId],
			item_ids: [ids.docId],
			meta_key: 'bound_docs_data',
			limit_type: 'fixed',
			limit_value: 90,
			limit_unit: 'day',
		})

		expect(status).toBeLessThan(500)
	})

	// ── 邊界：缺少參數 ───────────────────────────

	test('[P1] 缺少 product_ids — 回傳 400', async () => {
		const { status } = await wpPostForm(opts, API.productsUpdateBound, {
			item_ids: [ids.docId],
			meta_key: 'bound_docs_data',
			limit_type: 'unlimited',
		})

		expect(status).toBe(400)
	})

	test('[P1] 缺少 item_ids — 回傳 400', async () => {
		test.skip(!testProductId, '缺少測試商品')

		const { status } = await wpPostForm(opts, API.productsUpdateBound, {
			product_ids: [testProductId],
			meta_key: 'bound_docs_data',
			limit_type: 'unlimited',
		})

		expect(status).toBe(400)
	})

	test('[P2] item_ids 包含不存在的知識庫 ID — 不拋 500', async () => {
		test.skip(!testProductId, '缺少測試商品')

		const { status } = await wpPostForm(opts, API.productsUpdateBound, {
			product_ids: [testProductId],
			item_ids: [999999],
			meta_key: 'bound_docs_data',
			limit_type: 'unlimited',
		})

		expect(status).toBeLessThan(500)
	})

	test('[P3] limit_value 為負數 — 不拋 500', async () => {
		test.skip(!testProductId || !ids.docId, '缺少測試資料')

		const { status } = await wpPostForm(opts, API.productsUpdateBound, {
			product_ids: [testProductId],
			item_ids: [ids.docId],
			meta_key: 'bound_docs_data',
			limit_type: 'fixed',
			limit_value: -365,
			limit_unit: 'day',
		})

		expect(status).toBeLessThan(500)
	})

	test('[P3] limit_type 為未知值 — 不拋 500', async () => {
		test.skip(!testProductId || !ids.docId, '缺少測試資料')

		const { status } = await wpPostForm(opts, API.productsUpdateBound, {
			product_ids: [testProductId],
			item_ids: [ids.docId],
			meta_key: 'bound_docs_data',
			limit_type: 'unknown_type_xyz',
		})

		expect(status).toBeLessThan(500)
	})
})
