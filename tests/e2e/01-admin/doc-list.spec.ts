/**
 * [P0] 查詢知識庫列表 — doc-list.spec.ts
 *
 * 驗證 GET /v2/powerhouse/posts?post_type=pd_doc
 * 依據：spec/features/doc/查詢知識庫列表.feature
 *
 * 情境矩陣：
 * - 正常路徑：有無 meta_keys
 * - 分頁 Header 驗證
 * - 邊界：缺少 post_type、超大頁碼、負數 posts_per_page
 */
import { test, expect } from '@playwright/test'
import { wpGet, type ApiOptions } from '../helpers/api-client.js'
import { getNonce, getSetupIds, type SetupIds } from '../global-setup.js'
import { API } from '../fixtures/test-data.js'

test.describe('[P0] 查詢知識庫列表', () => {
	let opts: ApiOptions
	let ids: SetupIds

	test.beforeAll(async ({ request }, workerInfo) => {
		const baseURL = workerInfo.project.use.baseURL || 'http://localhost:8893'
		const nonce = getNonce()
		opts = { request, baseURL, nonce }
		ids = getSetupIds()
	})

	// ── 正常路徑 ────────────────────────────────

	test('[P0] 查詢知識庫列表 — 回傳 200 且為陣列', async () => {
		const { data, status } = await wpGet<unknown[]>(opts, API.posts, {
			post_type: 'pd_doc',
		})

		expect(status).toBe(200)
		expect(Array.isArray(data)).toBe(true)
	})

	test('[P0] 僅回傳根層級知識庫（parent_id=0）', async () => {
		const { data } = await wpGet<{ id: number; parent_id?: number }[]>(opts, API.posts, {
			post_type: 'pd_doc',
			posts_per_page: '50',
		})

		for (const doc of data) {
			const parentId = Number(doc.parent_id ?? 0)
			expect(parentId).toBe(0)
		}
	})

	test('[P0] 每筆知識庫包含必要欄位', async () => {
		const { data, status } = await wpGet<Record<string, unknown>[]>(opts, API.posts, {
			post_type: 'pd_doc',
			posts_per_page: '5',
		})

		expect(status).toBe(200)
		expect(data.length).toBeGreaterThan(0)

		const doc = data[0]
		expect(doc).toHaveProperty('id')
		expect(doc).toHaveProperty('name')
		expect(doc).toHaveProperty('slug')
		expect(doc).toHaveProperty('status')
		expect(doc).toHaveProperty('permalink')
	})

	test('[P0] 帶 meta_keys[]=need_access — 回傳 need_access 欄位', async () => {
		const url = new URL(`${opts.baseURL}/wp-json/${API.posts}`)
		url.searchParams.set('post_type', 'pd_doc')
		url.searchParams.append('meta_keys[]', 'need_access')
		url.searchParams.set('posts_per_page', '5')

		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})

		expect(res.status()).toBe(200)
		const data = await res.json() as Record<string, unknown>[]
		expect(data.length).toBeGreaterThan(0)

		const docWithAccess = data.find((d) => d.need_access !== undefined)
		if (docWithAccess) {
			expect(['yes', 'no', '']).toContain(docWithAccess.need_access)
		}
	})

	// ── 分頁 Header ──────────────────────────────

	test('[P0] 分頁 Header — X-WP-Total 和 X-WP-TotalPages 存在', async () => {
		const { headers, status } = await wpGet(opts, API.posts, {
			post_type: 'pd_doc',
			posts_per_page: '1',
			paged: '1',
		})

		expect(status).toBe(200)
		expect(headers['x-wp-total']).toBeDefined()
		expect(Number(headers['x-wp-total'])).toBeGreaterThanOrEqual(1)
		expect(headers['x-wp-totalpages']).toBeDefined()
	})

	test('[P0] 分頁 — 第 1 頁和第 2 頁資料不重複', async () => {
		const { headers } = await wpGet(opts, API.posts, {
			post_type: 'pd_doc',
			posts_per_page: '1',
		})
		const total = Number(headers['x-wp-total'])
		test.skip(total < 2, '知識庫少於 2 筆，跳過分頁差異測試')

		const page1 = await wpGet<{ id: number }[]>(opts, API.posts, {
			post_type: 'pd_doc',
			posts_per_page: '1',
			paged: '1',
		})
		const page2 = await wpGet<{ id: number }[]>(opts, API.posts, {
			post_type: 'pd_doc',
			posts_per_page: '1',
			paged: '2',
		})

		expect(page1.data.length).toBe(1)
		if (page2.data.length > 0) {
			expect(page1.data[0].id).not.toBe(page2.data[0].id)
		}
	})

	// ── 邊界：缺少 post_type ──────────────────────

	test('[P1] 缺少 post_type — 回傳 400', async () => {
		const { status } = await wpGet(opts, API.posts)
		expect(status).toBe(400)
	})

	// ── 邊界：數值 ───────────────────────────────

	test('[P2] posts_per_page=0 — 不造成伺服器錯誤', async () => {
		const { status } = await wpGet(opts, API.posts, {
			post_type: 'pd_doc',
			posts_per_page: '0',
		})

		expect(status).toBeLessThan(500)
	})

	test('[P2] posts_per_page 為負數 — 不造成伺服器錯誤', async () => {
		const { status } = await wpGet(opts, API.posts, {
			post_type: 'pd_doc',
			posts_per_page: '-1',
		})

		expect(status).toBeLessThan(500)
	})

	test('[P2] paged 超出範圍 — 回傳空陣列不拋錯', async () => {
		const { data, status } = await wpGet<unknown[]>(opts, API.posts, {
			post_type: 'pd_doc',
			paged: '999999',
		})

		expect(status).toBeLessThan(500)
		if (status === 200) {
			expect(Array.isArray(data)).toBe(true)
			expect(data.length).toBe(0)
		}
	})

	test('[P3] post_type 為 XSS 字串 — 不拋 500', async () => {
		const { status } = await wpGet(opts, API.posts, {
			post_type: '<script>alert(1)</script>',
		})

		expect(status).toBeLessThan(500)
	})
})
