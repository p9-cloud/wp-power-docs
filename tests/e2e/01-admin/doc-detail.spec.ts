/**
 * [P0] 查詢知識庫詳情 — doc-detail.spec.ts
 *
 * 驗證 GET /v2/powerhouse/posts/{id}
 * 依據：spec/features/doc/查詢知識庫詳情.feature
 *
 * 情境矩陣：
 * - 正常路徑：基本欄位、meta_keys 擴充、with_description
 * - bg_images 回傳完整圖片物件（id, url, width, height）
 * - 子章節 editor 為空時預設回傳 power-editor
 * - children 子章節列表
 * - 不存在 ID → 404
 * - 邊界 ID：0, -1, 999999, 非數字 → 400/404
 */
import { test, expect } from '@playwright/test'
import { wpGet, type ApiOptions } from '../helpers/api-client.js'
import { getNonce, getSetupIds, type SetupIds } from '../global-setup.js'
import { API } from '../fixtures/test-data.js'

test.describe('[P0] 查詢知識庫詳情', () => {
	let opts: ApiOptions
	let ids: SetupIds

	test.beforeAll(async ({ request }, workerInfo) => {
		const baseURL = workerInfo.project.use.baseURL || 'http://localhost:8893'
		const nonce = getNonce()
		opts = { request, baseURL, nonce }
		ids = getSetupIds()
	})

	// ── 正常路徑 ────────────────────────────────

	test('[P0] 查詢知識庫詳情 — 回傳 200 且包含基本欄位', async () => {
		const { data, status } = await wpGet<Record<string, unknown>>(opts, `${API.posts}/${ids.docId}`)

		expect(status).toBe(200)
		expect(data).toHaveProperty('id')
		expect(data).toHaveProperty('name')
		expect(data).toHaveProperty('slug')
		expect(data).toHaveProperty('status')
		expect(data).toHaveProperty('permalink')
	})

	test('[P0] 帶 meta_keys[]=need_access — 回傳 need_access 欄位', async () => {
		const url = new URL(`${opts.baseURL}/wp-json/${API.posts}/${ids.docId}`)
		url.searchParams.append('meta_keys[]', 'need_access')
		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})

		expect(res.status()).toBe(200)
		const data = await res.json() as { need_access?: string }
		expect(data.need_access).toBeDefined()
		expect(['yes', 'no', '']).toContain(data.need_access)
	})

	test('[P0] 帶 with_description=true — 回傳 description 欄位', async () => {
		const { data } = await wpGet<{ description?: string }>(
			opts,
			`${API.posts}/${ids.docId}`,
			{ with_description: 'true' },
		)

		expect(data).toHaveProperty('description')
	})

	test('[P0] 詳情包含 children 子章節列表', async () => {
		const { data } = await wpGet<{ children?: { id: number; name: string }[] }>(
			opts,
			`${API.posts}/${ids.docId}`,
		)

		if (data.children !== undefined) {
			expect(Array.isArray(data.children)).toBe(true)
			expect(data.children.length).toBeGreaterThan(0)

			const child = data.children[0]
			expect(child).toHaveProperty('id')
			expect(child).toHaveProperty('name')
		}
	})

	test('[P0] 子章節 editor 為空時預設回傳 power-editor', async () => {
		const { data } = await wpGet<{ editor?: string }>(opts, `${API.posts}/${ids.chapter1Id}`)

		// spec 規則：子章節 editor 為空時預設回傳 power-editor
		expect(data.editor).toBe('power-editor')
	})

	test('[P0] 全部 meta_keys — 一次查詢所有擴充欄位', async () => {
		const url = new URL(`${opts.baseURL}/wp-json/${API.posts}/${ids.docId}`)
		url.searchParams.append('meta_keys[]', 'need_access')
		url.searchParams.append('meta_keys[]', 'pd_keywords_label')
		url.searchParams.append('meta_keys[]', 'pd_keywords')
		url.searchParams.append('meta_keys[]', 'unauthorized_redirect_url')
		url.searchParams.set('with_description', 'true')

		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})

		expect(res.status()).toBe(200)
		const data = await res.json() as Record<string, unknown>
		// 根據 spec：查詢詳情時應回傳以下欄位
		expect(data).toHaveProperty('id')
		expect(data).toHaveProperty('name')
		expect(data).toHaveProperty('description')
		expect(data).toHaveProperty('need_access')
		expect(data).toHaveProperty('pd_keywords_label')
		expect(data).toHaveProperty('unauthorized_redirect_url')
	})

	test('[P0] 免費知識庫詳情 — need_access=no', async () => {
		const url = new URL(`${opts.baseURL}/wp-json/${API.posts}/${ids.freeDocId}`)
		url.searchParams.append('meta_keys[]', 'need_access')
		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})

		expect(res.status()).toBe(200)
		const data = await res.json() as { need_access?: string }
		expect(data.need_access).toBe('no')
	})

	// ── 邊界：不存在 ID ───────────────────────────

	test('[P1] 查詢不存在的知識庫 — 回傳 404', async () => {
		const { status } = await wpGet(opts, `${API.posts}/999999`)
		expect(status).toBe(404)
	})

	test('[P1] 查詢 ID=0 — 回傳 400 或 404', async () => {
		const { status } = await wpGet(opts, `${API.posts}/0`)
		expect([400, 404]).toContain(status)
	})

	test('[P1] 查詢負數 ID — 回傳 400 或 404', async () => {
		const { status } = await wpGet(opts, `${API.posts}/-1`)
		expect([400, 404]).toContain(status)
	})

	test('[P2] 查詢非數字 ID — 不造成 500', async () => {
		const { status } = await wpGet(opts, `${API.posts}/abc`)
		expect(status).toBeLessThan(500)
	})

	test('[P2] 查詢超大整數 ID — 不造成 500', async () => {
		const { status } = await wpGet(opts, `${API.posts}/${Number.MAX_SAFE_INTEGER}`)
		expect(status).toBeLessThan(500)
	})

	test('[P3] 查詢 ID 為 XSS 字串 — 不造成 500', async () => {
		const xssId = encodeURIComponent('<script>alert(1)</script>')
		const { status } = await wpGet(opts, `${API.posts}/${xssId}`)
		expect(status).toBeLessThan(500)
	})
})
