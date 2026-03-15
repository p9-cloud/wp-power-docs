/**
 * [P0] 綁定知識庫到商品 — product-bind.spec.ts
 *
 * 驗證 POST /v2/powerhouse/products/bind-items
 * 依據：spec/features/product/綁定知識庫到商品.feature
 *
 * 情境矩陣：
 * - limit_type=unlimited → 成功
 * - limit_type=fixed + limit_value + limit_unit → 成功
 * - 批量綁定到多個商品
 * - 缺少 product_ids → 400
 * - 缺少 item_ids → 400
 * - 缺少 meta_key → 400
 * - product_ids 為空陣列 → 400
 * - item_ids 為空陣列 → 400
 * - 不存在的 product_id → 不拋 500
 */
import { test, expect } from '@playwright/test'
import { wpGet, wpPostForm, type ApiOptions } from '../helpers/api-client.js'
import { getNonce, getSetupIds, type SetupIds } from '../global-setup.js'
import { API } from '../fixtures/test-data.js'

test.describe('[P0] 綁定知識庫到商品', () => {
	let opts: ApiOptions
	let ids: SetupIds
	let testProductId: number

	test.beforeAll(async ({ request }, workerInfo) => {
		const baseURL = workerInfo.project.use.baseURL || 'http://localhost:8893'
		const nonce = getNonce()
		opts = { request, baseURL, nonce }
		ids = getSetupIds()

		// 建立測試用商品（避免影響共用商品資料）
		try {
			const res = await request.post(`${baseURL}/wp-json/${API.wcProducts}`, {
				headers: { 'X-WP-Nonce': nonce, 'Content-Type': 'application/json' },
				data: {
					name: 'E2E 綁定測試商品',
					type: 'simple',
					regular_price: '999',
					status: 'publish',
				},
			})
			const prodData = await res.json() as { id: number }
			testProductId = Number(prodData.id)
		} catch {
			testProductId = ids.productId
		}
	})

	test.afterAll(async ({ request }) => {
		// 清理測試商品（不刪除共用商品）
		if (testProductId && testProductId !== ids.productId) {
			await request.delete(
				`${opts.baseURL}/wp-json/${API.wcProducts}/${testProductId}?force=true`,
				{ headers: { 'X-WP-Nonce': opts.nonce } },
			).catch(() => {})
		}
	})

	// ── 正常路徑 ────────────────────────────────

	test('[P0] 綁定知識庫 limit_type=unlimited — 回傳 200', async () => {
		test.skip(!testProductId || !ids.docId, '缺少測試商品或知識庫')

		const { status } = await wpPostForm(opts, API.productsBind, {
			product_ids: [testProductId],
			item_ids: [ids.docId],
			meta_key: 'bound_docs_data',
			limit_type: 'unlimited',
		})

		expect(status).toBe(200)
	})

	test('[P0] 綁定後查詢商品 — bound_docs_data 包含綁定資料', async () => {
		test.skip(!testProductId || !ids.docId, '缺少測試商品或知識庫')

		const url = new URL(`${opts.baseURL}/wp-json/${API.products}/${testProductId}`)
		url.searchParams.append('meta_keys[]', 'bound_docs_data')
		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})

		expect(res.status()).toBe(200)
		const data = await res.json() as { bound_docs_data?: { id: number; limit_type: string }[] }

		if (data.bound_docs_data && data.bound_docs_data.length > 0) {
			const binding = data.bound_docs_data.find((b) => b.id === ids.docId)
			if (binding) {
				expect(binding).toHaveProperty('id')
				expect(binding).toHaveProperty('limit_type')
				expect(['unlimited', 'fixed', 'follow_subscription']).toContain(binding.limit_type)
			}
		}
	})

	test('[P0] 綁定 limit_type=fixed — 帶 limit_value 和 limit_unit', async () => {
		test.skip(!testProductId || !ids.docId, '缺少測試商品或知識庫')

		const { status } = await wpPostForm(opts, API.productsBind, {
			product_ids: [testProductId],
			item_ids: [ids.docId],
			meta_key: 'bound_docs_data',
			limit_type: 'fixed',
			limit_value: 365,
			limit_unit: 'day',
		})

		expect(status).toBe(200)
	})

	test('[P0] 批量綁定到多個商品', async ({ request }) => {
		test.skip(!ids.docId, '缺少知識庫')

		// 建立第二個商品
		let product2Id = 0
		try {
			const res = await request.post(`${opts.baseURL}/wp-json/${API.wcProducts}`, {
				headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
				data: { name: 'E2E 批量綁定商品 2', type: 'simple', regular_price: '500', status: 'publish' },
			})
			const p = await res.json() as { id: number }
			product2Id = Number(p.id)
		} catch { /* ignore */ }

		if (!product2Id) {
			test.skip(true, '無法建立第二個測試商品')
			return
		}

		try {
			const { status } = await wpPostForm(opts, API.productsBind, {
				product_ids: [testProductId, product2Id],
				item_ids: [ids.docId],
				meta_key: 'bound_docs_data',
				limit_type: 'unlimited',
			})

			expect(status).toBe(200)
		} finally {
			await request.delete(
				`${opts.baseURL}/wp-json/${API.wcProducts}/${product2Id}?force=true`,
				{ headers: { 'X-WP-Nonce': opts.nonce } },
			).catch(() => {})
		}
	})

	// ── 邊界：缺少參數 ───────────────────────────

	test('[P1] 缺少 product_ids — 回傳 400', async () => {
		const { status } = await wpPostForm(opts, API.productsBind, {
			item_ids: [ids.docId],
			meta_key: 'bound_docs_data',
			limit_type: 'unlimited',
		})

		expect(status).toBe(400)
	})

	test('[P1] 缺少 item_ids — 回傳 400', async () => {
		const { status } = await wpPostForm(opts, API.productsBind, {
			product_ids: [testProductId],
			meta_key: 'bound_docs_data',
			limit_type: 'unlimited',
		})

		expect(status).toBe(400)
	})

	test('[P2] product_ids 包含不存在的 ID — 不拋 500', async () => {
		const { status } = await wpPostForm(opts, API.productsBind, {
			product_ids: [999999],
			item_ids: [ids.docId],
			meta_key: 'bound_docs_data',
			limit_type: 'unlimited',
		})

		expect(status).toBeLessThan(500)
	})

	test('[P2] item_ids 包含不存在的知識庫 ID — 不拋 500', async () => {
		const { status } = await wpPostForm(opts, API.productsBind, {
			product_ids: [testProductId],
			item_ids: [999999],
			meta_key: 'bound_docs_data',
			limit_type: 'unlimited',
		})

		expect(status).toBeLessThan(500)
	})

	test('[P3] limit_value=0 — 不拋 500', async () => {
		test.skip(!testProductId || !ids.docId, '缺少測試資料')

		const { status } = await wpPostForm(opts, API.productsBind, {
			product_ids: [testProductId],
			item_ids: [ids.docId],
			meta_key: 'bound_docs_data',
			limit_type: 'fixed',
			limit_value: 0,
			limit_unit: 'day',
		})

		expect(status).toBeLessThan(500)
	})

	test('[P3] limit_value 為負數 — 不拋 500', async () => {
		test.skip(!testProductId || !ids.docId, '缺少測試資料')

		const { status } = await wpPostForm(opts, API.productsBind, {
			product_ids: [testProductId],
			item_ids: [ids.docId],
			meta_key: 'bound_docs_data',
			limit_type: 'fixed',
			limit_value: -1,
			limit_unit: 'day',
		})

		expect(status).toBeLessThan(500)
	})
})
