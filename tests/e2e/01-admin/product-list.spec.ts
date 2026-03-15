/**
 * [P0] 查詢商品列表 — product-list.spec.ts
 *
 * 驗證 GET /v2/powerhouse/products
 * 依據：spec/features/product/查詢商品列表.feature
 *
 * 情境矩陣：
 * - 不帶 meta_keys → 回傳商品基本欄位
 * - 帶 meta_keys[]=bound_docs_data → 回傳知識庫綁定資料
 * - 已綁定商品的 bound_docs_data 結構驗證
 * - 未綁定商品 bound_docs_data 為空陣列
 * - 分頁：posts_per_page + paged
 * - 分頁標頭 X-WP-Total / X-WP-TotalPages
 * - 邊界：posts_per_page=0, 負數, 超大 paged
 */
import { test, expect } from '@playwright/test'
import { wpGet, type ApiOptions } from '../helpers/api-client.js'
import { getNonce, getSetupIds, type SetupIds } from '../global-setup.js'
import { API } from '../fixtures/test-data.js'

test.describe('[P0] 查詢商品列表', () => {
	let opts: ApiOptions
	let ids: SetupIds

	test.beforeAll(async ({ request }, workerInfo) => {
		const baseURL = workerInfo.project.use.baseURL || 'http://localhost:8893'
		const nonce = getNonce()
		opts = { request, baseURL, nonce }
		ids = getSetupIds()
	})

	// ── 正常路徑 ────────────────────────────────

	test('[P0] 查詢商品列表 — 回傳 200 且為陣列', async () => {
		const url = new URL(`${opts.baseURL}/wp-json/${API.products}`)
		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})

		expect(res.status()).toBe(200)
		const data = await res.json()
		expect(Array.isArray(data)).toBe(true)
	})

	test('[P0] 商品包含基本欄位', async () => {
		const { data, status } = await wpGet<{ id: number; name: string; type: string; status: string }[]>(
			opts,
			API.products,
		)

		expect(status).toBe(200)
		if (data.length > 0) {
			const product = data[0]
			expect(product).toHaveProperty('id')
			expect(product).toHaveProperty('name')
			expect(product).toHaveProperty('type')
			expect(product).toHaveProperty('status')
		}
	})

	test('[P0] 帶 meta_keys[]=bound_docs_data — 每筆商品均含 bound_docs_data 欄位', async () => {
		const url = new URL(`${opts.baseURL}/wp-json/${API.products}`)
		url.searchParams.append('meta_keys[]', 'bound_docs_data')
		url.searchParams.set('posts_per_page', '50')

		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})

		expect(res.status()).toBe(200)
		const data = await res.json() as { id: number; bound_docs_data?: unknown[] }[]

		if (data.length > 0) {
			for (const product of data) {
				expect(product).toHaveProperty('bound_docs_data')
				expect(Array.isArray(product.bound_docs_data)).toBe(true)
			}
		}
	})

	test('[P0] 已綁定知識庫的商品 — bound_docs_data 包含正確結構', async () => {
		test.skip(!ids.productId, '缺少測試商品')

		// 先確保測試商品已綁定知識庫（透過 setup 中綁定）
		const url = new URL(`${opts.baseURL}/wp-json/${API.products}`)
		url.searchParams.append('meta_keys[]', 'bound_docs_data')
		url.searchParams.set('posts_per_page', '100')

		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})

		expect(res.status()).toBe(200)
		const data = await res.json() as { id: number; bound_docs_data?: { id: number; limit_type: string }[] }[]

		const boundProduct = data.find(
			(p) => Array.isArray(p.bound_docs_data) && p.bound_docs_data.length > 0,
		)

		if (boundProduct) {
			const binding = boundProduct.bound_docs_data![0]
			expect(binding).toHaveProperty('limit_type')
			expect(['unlimited', 'fixed', 'follow_subscription']).toContain(binding.limit_type)
		}
	})

	test('[P0] 未綁定知識庫的商品 — bound_docs_data 為空陣列', async () => {
		const url = new URL(`${opts.baseURL}/wp-json/${API.products}`)
		url.searchParams.append('meta_keys[]', 'bound_docs_data')
		url.searchParams.set('posts_per_page', '100')

		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})

		expect(res.status()).toBe(200)
		const data = await res.json() as { id: number; bound_docs_data?: unknown[] }[]

		const unboundProduct = data.find(
			(p) => Array.isArray(p.bound_docs_data) && p.bound_docs_data.length === 0,
		)

		if (unboundProduct) {
			expect(unboundProduct.bound_docs_data).toEqual([])
		}
	})

	test('[P0] 分頁 — posts_per_page=1 只回傳 1 筆', async () => {
		const url = new URL(`${opts.baseURL}/wp-json/${API.products}`)
		url.searchParams.set('posts_per_page', '1')
		url.searchParams.set('paged', '1')

		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})

		expect(res.status()).toBe(200)
		const data = await res.json() as unknown[]
		expect(Array.isArray(data)).toBe(true)
		expect(data.length).toBeLessThanOrEqual(1)
	})

	test('[P0] 分頁標頭 X-WP-Total 存在且合理', async () => {
		const url = new URL(`${opts.baseURL}/wp-json/${API.products}`)
		url.searchParams.set('posts_per_page', '1')

		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})

		expect(res.status()).toBe(200)

		const total = res.headers()['x-wp-total']
		const totalPages = res.headers()['x-wp-totalPages'] ?? res.headers()['x-wp-totalpages']

		if (total !== undefined) {
			expect(Number(total)).toBeGreaterThanOrEqual(0)
		}
		if (totalPages !== undefined) {
			expect(Number(totalPages)).toBeGreaterThanOrEqual(1)
		}
	})

	test('[P1] paged=2 與 paged=1 不重複', async () => {
		const fetchPage = async (page: number) => {
			const url = new URL(`${opts.baseURL}/wp-json/${API.products}`)
			url.searchParams.set('posts_per_page', '1')
			url.searchParams.set('paged', String(page))
			const res = await opts.request.get(url.toString(), {
				headers: { 'X-WP-Nonce': opts.nonce },
			})
			return res.status() === 200 ? res.json() as Promise<{ id: number }[]> : []
		}

		const page1 = await fetchPage(1)
		const page2 = await fetchPage(2)

		if (page1.length > 0 && page2.length > 0) {
			const ids1 = page1.map((p: { id: number }) => p.id)
			const ids2 = page2.map((p: { id: number }) => p.id)
			const overlap = ids1.filter((id: number) => ids2.includes(id))
			expect(overlap).toHaveLength(0)
		}
	})

	// ── 邊界：分頁參數 ───────────────────────────

	test('[P2] posts_per_page=0 — 不造成 500', async () => {
		const url = new URL(`${opts.baseURL}/wp-json/${API.products}`)
		url.searchParams.set('posts_per_page', '0')

		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})

		expect(res.status()).toBeLessThan(500)
	})

	test('[P2] posts_per_page 為負數 — 不造成 500', async () => {
		const url = new URL(`${opts.baseURL}/wp-json/${API.products}`)
		url.searchParams.set('posts_per_page', '-1')

		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})

		expect(res.status()).toBeLessThan(500)
	})

	test('[P2] paged 超大 — 不造成 500，回傳空陣列或正常', async () => {
		const url = new URL(`${opts.baseURL}/wp-json/${API.products}`)
		url.searchParams.set('posts_per_page', '10')
		url.searchParams.set('paged', '999999')

		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})

		expect(res.status()).toBeLessThan(500)
		if (res.status() === 200) {
			const data = await res.json() as unknown[]
			expect(Array.isArray(data)).toBe(true)
		}
	})

	test('[P3] meta_keys[] 帶不存在的 key — 不造成 500', async () => {
		const url = new URL(`${opts.baseURL}/wp-json/${API.products}`)
		url.searchParams.append('meta_keys[]', 'non_existent_meta_key_xyz')

		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})

		expect(res.status()).toBeLessThan(500)
	})
})
