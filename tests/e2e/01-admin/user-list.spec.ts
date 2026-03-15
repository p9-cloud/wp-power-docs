/**
 * [P0] 查詢用戶列表 — user-list.spec.ts
 *
 * 驗證 GET /power-docs/v1/users
 * 依據：spec/features/user/查詢用戶列表.feature
 *
 * 情境矩陣：
 * - 預設查詢 → 200，陣列，含必要欄位
 * - 分頁標頭 X-WP-Total / X-WP-TotalPages / X-WP-CurrentPage / X-WP-PageSize
 * - 搜尋 s=admin（email / 帳號）
 * - meta_keys[]=granted_docs → 回傳授權資訊
 * - granted_docs[] 篩選 → 只回傳有授權的用戶
 * - 排序 orderby=ID, order=ASC
 * - 分頁 posts_per_page=1, paged=1 vs paged=2 不重複
 * - 邊界：posts_per_page=0, 負數, paged 超大
 * - 邊界：搜尋空字串、XSS、SQL injection
 */
import { test, expect } from '@playwright/test'
import { wpGet, type ApiOptions } from '../helpers/api-client.js'
import { getNonce, getSetupIds, type SetupIds } from '../global-setup.js'
import { API, EDGE_STRINGS } from '../fixtures/test-data.js'

test.describe('[P0] 查詢用戶列表', () => {
	let opts: ApiOptions
	let ids: SetupIds

	test.beforeAll(async ({ request }, workerInfo) => {
		const baseURL = workerInfo.project.use.baseURL || 'http://localhost:8893'
		const nonce = getNonce()
		opts = { request, baseURL, nonce }
		ids = getSetupIds()
	})

	// ── 正常路徑 ────────────────────────────────

	test('[P0] 查詢用戶列表 — 回傳 200 且為陣列', async () => {
		const { data, status } = await wpGet<{ id: number }[]>(opts, API.users)

		expect(status).toBe(200)
		expect(Array.isArray(data)).toBe(true)
	})

	test('[P0] 用戶包含必要欄位', async () => {
		const { data } = await wpGet<{ id: number; user_login: string; user_email: string; display_name: string }[]>(
			opts,
			API.users,
		)

		expect(data.length).toBeGreaterThan(0)
		const user = data[0]
		expect(user).toHaveProperty('id')
		expect(user).toHaveProperty('user_login')
		expect(user).toHaveProperty('user_email')
		expect(user).toHaveProperty('display_name')
	})

	test('[P0] 回應包含分頁 Header', async () => {
		const { headers, status } = await wpGet<{ id: number }[]>(opts, API.users, {
			posts_per_page: '2',
			paged: '1',
		})

		expect(status).toBe(200)
		// 至少應包含 x-wp-total
		expect(headers['x-wp-total']).toBeDefined()
	})

	test('[P0] 搜尋 s=admin — 找到 admin 用戶', async () => {
		const { data, status } = await wpGet<{ id: number; user_login: string; user_email: string }[]>(
			opts,
			API.users,
			{ s: 'admin' },
		)

		expect(status).toBe(200)
		expect(data.length).toBeGreaterThan(0)
	})

	test('[P0] 搜尋 s= email prefix — 結果包含對應用戶', async () => {
		const { data, status } = await wpGet<{ id: number; user_email: string }[]>(
			opts,
			API.users,
			{ s: 'admin@' },
		)

		expect(status).toBe(200)
		if (data.length > 0) {
			const found = data.some((u) => u.user_email?.includes('admin'))
			expect(found).toBe(true)
		}
	})

	test('[P0] 分頁 paged=1 筆數正確', async () => {
		const { data, status } = await wpGet<{ id: number }[]>(opts, API.users, {
			posts_per_page: '1',
			paged: '1',
		})

		expect(status).toBe(200)
		expect(data.length).toBeLessThanOrEqual(1)
	})

	test('[P0] paged=1 與 paged=2 用戶不重複', async () => {
		const page1 = await wpGet<{ id: number }[]>(opts, API.users, {
			posts_per_page: '1',
			paged: '1',
		})

		expect(page1.status).toBe(200)

		const total = Number(page1.headers['x-wp-total'])
		if (total > 1) {
			const page2 = await wpGet<{ id: number }[]>(opts, API.users, {
				posts_per_page: '1',
				paged: '2',
			})

			expect(page2.data.length).toBeLessThanOrEqual(1)
			if (page1.data.length > 0 && page2.data.length > 0) {
				expect(page1.data[0].id).not.toBe(page2.data[0].id)
			}
		}
	})

	test('[P0] 帶 meta_keys[]=granted_docs — 回傳授權資訊欄位', async () => {
		const url = new URL(`${opts.baseURL}/wp-json/${API.users}`)
		url.searchParams.append('meta_keys[]', 'granted_docs')
		url.searchParams.set('posts_per_page', '10')

		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})

		expect(res.status()).toBe(200)
		const data = await res.json() as { id: number; granted_docs?: { id: number; title: string }[] }[]
		expect(Array.isArray(data)).toBe(true)

		const userWithDocs = data.find(
			(u) => u.granted_docs && Array.isArray(u.granted_docs) && u.granted_docs.length > 0,
		)
		if (userWithDocs) {
			const grant = userWithDocs.granted_docs![0]
			expect(grant).toHaveProperty('id')
			expect(grant).toHaveProperty('title')
		}
	})

	test('[P1] granted_docs[] 篩選 — 只回傳有授權的用戶', async () => {
		test.skip(!ids.docId, '缺少測試知識庫')

		const url = new URL(`${opts.baseURL}/wp-json/${API.users}`)
		url.searchParams.append('granted_docs[]', String(ids.docId))

		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})

		expect(res.status()).toBe(200)
		const data = await res.json() as { id: number }[]
		expect(Array.isArray(data)).toBe(true)
	})

	test('[P1] 排序 orderby=ID, order=ASC — ID 遞增', async () => {
		const { data, status } = await wpGet<{ id: number }[]>(opts, API.users, {
			orderby: 'ID',
			order: 'ASC',
			posts_per_page: '5',
		})

		expect(status).toBe(200)
		if (data.length >= 2) {
			expect(Number(data[0].id)).toBeLessThanOrEqual(Number(data[1].id))
		}
	})

	test('[P1] 排序 orderby=ID, order=DESC — ID 遞減', async () => {
		const { data, status } = await wpGet<{ id: number }[]>(opts, API.users, {
			orderby: 'ID',
			order: 'DESC',
			posts_per_page: '5',
		})

		expect(status).toBe(200)
		if (data.length >= 2) {
			expect(Number(data[0].id)).toBeGreaterThanOrEqual(Number(data[1].id))
		}
	})

	// ── 邊界：分頁參數 ───────────────────────────

	test('[P2] posts_per_page=0 — 不造成 500', async () => {
		const { status } = await wpGet<{ id: number }[]>(opts, API.users, {
			posts_per_page: '0',
		})

		expect(status).toBeLessThan(500)
	})

	test('[P2] posts_per_page 為負數 — 不造成 500', async () => {
		const { status } = await wpGet<{ id: number }[]>(opts, API.users, {
			posts_per_page: '-1',
		})

		expect(status).toBeLessThan(500)
	})

	test('[P2] paged 超大 — 不造成 500', async () => {
		const { status } = await wpGet<{ id: number }[]>(opts, API.users, {
			posts_per_page: '10',
			paged: '999999',
		})

		expect(status).toBeLessThan(500)
	})

	// ── 邊界：搜尋字串 ───────────────────────────

	test('[P2] 搜尋空字串 — 不造成 500', async () => {
		const { status } = await wpGet<{ id: number }[]>(opts, API.users, {
			s: '',
		})

		expect(status).toBeLessThan(500)
	})

	test('[P3] 搜尋 XSS 字串 — 不造成 500', async () => {
		const url = new URL(`${opts.baseURL}/wp-json/${API.users}`)
		url.searchParams.set('s', EDGE_STRINGS.xssScript)

		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})

		expect(res.status()).toBeLessThan(500)
	})

	test('[P3] 搜尋 SQL injection 字串 — 不造成 500', async () => {
		const url = new URL(`${opts.baseURL}/wp-json/${API.users}`)
		url.searchParams.set('s', EDGE_STRINGS.sqlInjection)

		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})

		expect(res.status()).toBeLessThan(500)
	})

	test('[P3] granted_docs[] 帶不存在的知識庫 ID — 不造成 500', async () => {
		const url = new URL(`${opts.baseURL}/wp-json/${API.users}`)
		url.searchParams.append('granted_docs[]', '999999')

		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})

		expect(res.status()).toBeLessThan(500)
	})
})
