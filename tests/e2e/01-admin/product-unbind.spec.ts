/**
 * [P0] 解除商品知識庫綁定 — product-unbind.spec.ts
 *
 * 驗證 POST /v2/powerhouse/products/unbind-items
 * 依據：spec/features/product/解除知識庫綁定.feature
 *
 * 情境矩陣：
 * - 解除已綁定的知識庫 → 200，bound_docs_data 移除
 * - 解除後再解除同 ID → 不拋 500（冪等）
 * - 部分解除（保留其他綁定）
 * - 缺少 product_ids → 400
 * - 缺少 item_ids → 400
 * - 空 item_ids → 400 或成功 noop
 * - 不存在的 item_id → 不拋 500
 */
import { test, expect } from '@playwright/test'
import { wpGet, wpPostForm, type ApiOptions } from '../helpers/api-client.js'
import { getNonce, getSetupIds, type SetupIds } from '../global-setup.js'
import { API } from '../fixtures/test-data.js'

test.describe('[P0] 解除商品知識庫綁定', () => {
	let opts: ApiOptions
	let ids: SetupIds
	let testProductId: number
	let doc2Id: number

	test.beforeAll(async ({ request }, workerInfo) => {
		const baseURL = workerInfo.project.use.baseURL || 'http://localhost:8893'
		const nonce = getNonce()
		opts = { request, baseURL, nonce }
		ids = getSetupIds()

		// 建立測試商品
		try {
			const res = await request.post(`${baseURL}/wp-json/${API.wcProducts}`, {
				headers: { 'X-WP-Nonce': nonce, 'Content-Type': 'application/json' },
				data: {
					name: 'E2E 解綁測試商品',
					type: 'simple',
					regular_price: '888',
					status: 'publish',
				},
			})
			const prodData = await res.json() as { id: number }
			testProductId = Number(prodData.id)
		} catch {
			testProductId = 0
		}

		// 建立第二個測試知識庫（用於部分解除測試）
		try {
			const res = await request.post(`${baseURL}/wp-json/${API.posts}`, {
				headers: { 'X-WP-Nonce': nonce, 'Content-Type': 'application/json' },
				data: { post_type: 'pd_doc', name: 'E2E 解綁-知識庫 2', status: 'publish' },
			})
			const docData = await res.json() as { id: number }
			doc2Id = Number(docData.id)
		} catch {
			doc2Id = 0
		}
	})

	test.afterAll(async ({ request }) => {
		if (testProductId) {
			await request.delete(
				`${opts.baseURL}/wp-json/${API.wcProducts}/${testProductId}?force=true`,
				{ headers: { 'X-WP-Nonce': opts.nonce } },
			).catch(() => {})
		}
		if (doc2Id) {
			await request.delete(
				`${opts.baseURL}/wp-json/${API.posts}/${doc2Id}`,
				{ headers: { 'X-WP-Nonce': opts.nonce } },
			).catch(() => {})
		}
	})

	// ── 正常路徑 ────────────────────────────────

	test('[P0] 解除綁定 — 回傳 200', async () => {
		test.skip(!testProductId || !ids.docId, '缺少測試資料')

		// 先綁定
		await wpPostForm(opts, API.productsBind, {
			product_ids: [testProductId],
			item_ids: [ids.docId],
			meta_key: 'bound_docs_data',
			limit_type: 'unlimited',
		})

		// 再解除
		const { status } = await wpPostForm(opts, API.productsUnbind, {
			product_ids: [testProductId],
			item_ids: [ids.docId],
			meta_key: 'bound_docs_data',
		})

		expect(status).toBe(200)
	})

	test('[P0] 解除後查詢 — bound_docs_data 不含已解除知識庫', async () => {
		test.skip(!testProductId || !ids.docId, '缺少測試資料')

		// 重新綁定再解除，確保狀態一致
		await wpPostForm(opts, API.productsBind, {
			product_ids: [testProductId],
			item_ids: [ids.docId],
			meta_key: 'bound_docs_data',
			limit_type: 'unlimited',
		})
		await wpPostForm(opts, API.productsUnbind, {
			product_ids: [testProductId],
			item_ids: [ids.docId],
			meta_key: 'bound_docs_data',
		})

		const url = new URL(`${opts.baseURL}/wp-json/${API.products}/${testProductId}`)
		url.searchParams.append('meta_keys[]', 'bound_docs_data')
		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})

		expect(res.status()).toBe(200)
		const data = await res.json() as { bound_docs_data?: { id: number; post_id?: number }[] }

		if (data.bound_docs_data && Array.isArray(data.bound_docs_data)) {
			const stillBound = data.bound_docs_data.find(
				(b) => Number(b.id) === ids.docId || Number(b.post_id) === ids.docId,
			)
			expect(stillBound).toBeUndefined()
		}
	})

	test('[P0] 部分解除 — 保留其他知識庫綁定', async () => {
		test.skip(!testProductId || !ids.docId || !doc2Id, '缺少測試資料')

		// 綁定兩個知識庫
		await wpPostForm(opts, API.productsBind, {
			product_ids: [testProductId],
			item_ids: [ids.docId, doc2Id],
			meta_key: 'bound_docs_data',
			limit_type: 'unlimited',
		})

		// 只解除第一個
		await wpPostForm(opts, API.productsUnbind, {
			product_ids: [testProductId],
			item_ids: [ids.docId],
			meta_key: 'bound_docs_data',
		})

		const url = new URL(`${opts.baseURL}/wp-json/${API.products}/${testProductId}`)
		url.searchParams.append('meta_keys[]', 'bound_docs_data')
		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})

		if (res.status() === 200) {
			const data = await res.json() as { bound_docs_data?: { id: number; post_id?: number }[] }
			if (data.bound_docs_data && Array.isArray(data.bound_docs_data)) {
				// 第一個應已解除
				const doc1Bound = data.bound_docs_data.find(
					(b) => Number(b.id) === ids.docId || Number(b.post_id) === ids.docId,
				)
				expect(doc1Bound).toBeUndefined()

				// 第二個應仍綁定
				const doc2Bound = data.bound_docs_data.find(
					(b) => Number(b.id) === doc2Id || Number(b.post_id) === doc2Id,
				)
				expect(doc2Bound).toBeDefined()
			}
		}
	})

	test('[P1] 重複解除同 ID — 不拋 500（冪等）', async () => {
		test.skip(!testProductId || !ids.docId, '缺少測試資料')

		// 先確保已解除狀態
		await wpPostForm(opts, API.productsUnbind, {
			product_ids: [testProductId],
			item_ids: [ids.docId],
			meta_key: 'bound_docs_data',
		}).catch(() => {})

		// 再次解除
		const { status } = await wpPostForm(opts, API.productsUnbind, {
			product_ids: [testProductId],
			item_ids: [ids.docId],
			meta_key: 'bound_docs_data',
		})

		expect(status).toBeLessThan(500)
	})

	// ── 邊界：缺少參數 ───────────────────────────

	test('[P1] 缺少 product_ids — 回傳 400', async () => {
		const { status } = await wpPostForm(opts, API.productsUnbind, {
			item_ids: [ids.docId],
			meta_key: 'bound_docs_data',
		})

		expect(status).toBe(400)
	})

	test('[P1] 缺少 item_ids — 回傳 400', async () => {
		test.skip(!testProductId, '缺少測試商品')

		const { status } = await wpPostForm(opts, API.productsUnbind, {
			product_ids: [testProductId],
			meta_key: 'bound_docs_data',
		})

		expect(status).toBe(400)
	})

	test('[P2] item_ids 包含不存在的知識庫 ID — 不拋 500', async () => {
		test.skip(!testProductId, '缺少測試商品')

		const { status } = await wpPostForm(opts, API.productsUnbind, {
			product_ids: [testProductId],
			item_ids: [999999],
			meta_key: 'bound_docs_data',
		})

		expect(status).toBeLessThan(500)
	})

	test('[P2] product_ids 包含不存在的商品 ID — 不拋 500', async () => {
		const { status } = await wpPostForm(opts, API.productsUnbind, {
			product_ids: [999999],
			item_ids: [ids.docId],
			meta_key: 'bound_docs_data',
		})

		expect(status).toBeLessThan(500)
	})
})
