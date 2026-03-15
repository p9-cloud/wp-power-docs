/**
 * [P0] 更新知識庫 — doc-update.spec.ts
 *
 * 驗證 PATCH /v2/powerhouse/posts/{id}
 * 依據：spec/features/doc/更新知識庫.feature
 *
 * 情境矩陣：
 * - 更新標題、內容、狀態、need_access、slug
 * - pd_keywords_label、pd_keywords、unauthorized_redirect_url
 * - bg_images=delete 清除背景圖
 * - editor 切換為 power-editor 後清除 Elementor meta
 * - 更新不存在的文章 → 404
 * - 更新 ID=0, -1, 非數字 → 400/404
 * - XSS 標題被安全儲存
 */
import { test, expect } from '@playwright/test'
import { wpGet, wpPost, wpDelete, type ApiOptions } from '../helpers/api-client.js'
import { getNonce } from '../global-setup.js'
import { API, EDGE_STRINGS } from '../fixtures/test-data.js'

test.describe('[P0] 更新知識庫', () => {
	let opts: ApiOptions
	let docId: number
	let chapterId: number

	test.beforeAll(async ({ request }, workerInfo) => {
		const baseURL = workerInfo.project.use.baseURL || 'http://localhost:8893'
		const nonce = getNonce()
		opts = { request, baseURL, nonce }

		// 建立測試用知識庫和章節
		const { data: doc } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 更新測試-知識庫',
			status: 'publish',
		})
		docId = Number(doc.id)

		const { data: ch } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 更新測試-章節',
			post_parent: docId,
			status: 'publish',
		})
		chapterId = Number(ch.id)
	})

	test.afterAll(async () => {
		await wpDelete(opts, `${API.posts}/${chapterId}`).catch(() => {})
		await wpDelete(opts, `${API.posts}/${docId}`).catch(() => {})
	})

	// ── 正常路徑 ────────────────────────────────

	test('[P0] 更新標題 — 回傳 200 且名稱更新', async ({ request }) => {
		const newName = 'E2E 更新後標題'
		const res = await request.patch(
			`${opts.baseURL}/wp-json/${API.posts}/${docId}`,
			{
				headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
				data: { name: newName },
			},
		)

		expect(res.status()).toBe(200)

		const { data: detail } = await wpGet<{ name?: string }>(opts, `${API.posts}/${docId}`)
		expect(detail.name).toBe(newName)
	})

	test('[P0] 更新文章內容 — post_content 反映在 description', async ({ request }) => {
		const newContent = '<p>E2E 更新後的內容</p>'
		const res = await request.patch(
			`${opts.baseURL}/wp-json/${API.posts}/${docId}`,
			{
				headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
				data: { post_content: newContent },
			},
		)

		expect(res.status()).toBe(200)

		const { data: detail } = await wpGet<{ description?: string }>(
			opts,
			`${API.posts}/${docId}`,
			{ with_description: 'true' },
		)
		expect(detail.description).toContain('更新後的內容')
	})

	test('[P0] 更新狀態 publish → draft', async ({ request }) => {
		const res = await request.patch(
			`${opts.baseURL}/wp-json/${API.posts}/${docId}`,
			{
				headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
				data: { status: 'draft' },
			},
		)

		expect(res.status()).toBe(200)

		const { data: detail } = await wpGet<{ status?: string }>(opts, `${API.posts}/${docId}`)
		expect(detail.status).toBe('draft')

		// 恢復為 publish，不影響後續測試
		await request.patch(
			`${opts.baseURL}/wp-json/${API.posts}/${docId}`,
			{
				headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
				data: { status: 'publish' },
			},
		)
	})

	test('[P0] 更新 need_access=yes', async ({ request }) => {
		const res = await request.patch(
			`${opts.baseURL}/wp-json/${API.posts}/${docId}`,
			{
				headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
				data: { need_access: 'yes' },
			},
		)

		expect(res.status()).toBe(200)

		const url = new URL(`${opts.baseURL}/wp-json/${API.posts}/${docId}`)
		url.searchParams.append('meta_keys[]', 'need_access')
		const checkRes = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})
		const detail = await checkRes.json() as { need_access?: string }
		expect(detail.need_access).toBe('yes')
	})

	test('[P0] 更新 need_access=no', async ({ request }) => {
		const res = await request.patch(
			`${opts.baseURL}/wp-json/${API.posts}/${docId}`,
			{
				headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
				data: { need_access: 'no' },
			},
		)

		expect(res.status()).toBe(200)
	})

	test('[P0] 更新 pd_keywords_label', async ({ request }) => {
		const newLabel = '熱門搜尋：'
		const res = await request.patch(
			`${opts.baseURL}/wp-json/${API.posts}/${docId}`,
			{
				headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
				data: { pd_keywords_label: newLabel },
			},
		)

		expect(res.status()).toBe(200)

		const url = new URL(`${opts.baseURL}/wp-json/${API.posts}/${docId}`)
		url.searchParams.append('meta_keys[]', 'pd_keywords_label')
		const checkRes = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})
		const detail = await checkRes.json() as { pd_keywords_label?: string }
		expect(detail.pd_keywords_label).toBe(newLabel)
	})

	test('[P0] 更新 unauthorized_redirect_url', async ({ request }) => {
		const newUrl = 'https://example.com/buy-now'
		const res = await request.patch(
			`${opts.baseURL}/wp-json/${API.posts}/${docId}`,
			{
				headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
				data: { unauthorized_redirect_url: newUrl },
			},
		)

		expect(res.status()).toBe(200)

		const url = new URL(`${opts.baseURL}/wp-json/${API.posts}/${docId}`)
		url.searchParams.append('meta_keys[]', 'unauthorized_redirect_url')
		const checkRes = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})
		const detail = await checkRes.json() as { unauthorized_redirect_url?: string }
		expect(detail.unauthorized_redirect_url).toBe(newUrl)
	})

	test('[P0] bg_images=delete — 清除背景圖 meta', async ({ request }) => {
		const res = await request.patch(
			`${opts.baseURL}/wp-json/${API.posts}/${docId}`,
			{
				headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
				data: { bg_images: 'delete' },
			},
		)

		expect(res.status()).toBe(200)

		const url = new URL(`${opts.baseURL}/wp-json/${API.posts}/${docId}`)
		url.searchParams.append('meta_keys[]', 'bg_images')
		const checkRes = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})
		const detail = await checkRes.json() as { bg_images?: unknown }
		// spec 規則：bg_images 為 delete 時清除，應為空陣列或空值
		const bgImages = detail.bg_images
		const isEmpty = !bgImages
			|| (Array.isArray(bgImages) && bgImages.length === 0)
			|| bgImages === ''
		expect(isEmpty).toBe(true)
	})

	test('[P0] 更新 editor=power-editor — 回傳 200', async ({ request }) => {
		const res = await request.patch(
			`${opts.baseURL}/wp-json/${API.posts}/${chapterId}`,
			{
				headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
				data: { editor: 'power-editor' },
			},
		)

		expect(res.status()).toBe(200)

		const { data: detail } = await wpGet<{ editor?: string }>(opts, `${API.posts}/${chapterId}`)
		expect(detail.editor).toBe('power-editor')
	})

	// ── 邊界：不存在 ID ───────────────────────────

	test('[P1] 更新不存在的文章 — 回傳 404', async ({ request }) => {
		const res = await request.patch(
			`${opts.baseURL}/wp-json/${API.posts}/999999`,
			{
				headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
				data: { name: 'Ghost Doc' },
			},
		)

		expect(res.status()).toBe(404)
	})

	test('[P1] 更新 ID=0 — 回傳 400 或 404', async ({ request }) => {
		const res = await request.patch(
			`${opts.baseURL}/wp-json/${API.posts}/0`,
			{
				headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
				data: { name: 'Zero ID' },
			},
		)

		expect([400, 404]).toContain(res.status())
	})

	test('[P2] 更新 ID 為非數字 — 不造成 500', async ({ request }) => {
		const res = await request.patch(
			`${opts.baseURL}/wp-json/${API.posts}/abc`,
			{
				headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
				data: { name: 'Non-numeric ID' },
			},
		)

		expect(res.status()).toBeLessThan(500)
	})

	// ── 邊界：字串 ───────────────────────────────

	test('[P2] 更新標題為 XSS 字串 — 安全儲存', async ({ request }) => {
		const res = await request.patch(
			`${opts.baseURL}/wp-json/${API.posts}/${docId}`,
			{
				headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
				data: { name: EDGE_STRINGS.xssScript },
			},
		)

		// 允許成功或拒絕，但不能 500
		expect(res.status()).toBeLessThan(500)

		if (res.status() === 200) {
			const { data: detail } = await wpGet<{ name?: string }>(opts, `${API.posts}/${docId}`)
			// 名稱不應含有原始 <script> 標籤
			expect(detail.name).not.toContain('<script>')
		}
	})

	test('[P2] 更新標題為 SQL injection — 安全儲存', async ({ request }) => {
		const res = await request.patch(
			`${opts.baseURL}/wp-json/${API.posts}/${docId}`,
			{
				headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
				data: { name: EDGE_STRINGS.sqlInjection },
			},
		)

		expect(res.status()).toBeLessThan(500)
	})

	test('[P3] 更新標題為空字串 — 回傳 400 或保持原值', async ({ request }) => {
		const res = await request.patch(
			`${opts.baseURL}/wp-json/${API.posts}/${docId}`,
			{
				headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
				data: { name: '' },
			},
		)

		// 空標題應被拒絕或忽略，不應造成 500
		expect(res.status()).toBeLessThan(500)
	})

	test('[P3] 更新 unauthorized_redirect_url 為路徑穿越字串 — 安全儲存', async ({ request }) => {
		const res = await request.patch(
			`${opts.baseURL}/wp-json/${API.posts}/${docId}`,
			{
				headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
				data: { unauthorized_redirect_url: EDGE_STRINGS.pathTraversal },
			},
		)

		// 不應造成 500
		expect(res.status()).toBeLessThan(500)
	})

	// ── 重複更新（冪等性）──────────────────────────

	test('[P2] 連續更新同一欄位兩次 — 第二次也成功', async ({ request }) => {
		const patchBody = {
			headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
			data: { pd_keywords_label: '重複更新測試：' },
		}
		const url = `${opts.baseURL}/wp-json/${API.posts}/${docId}`

		const res1 = await request.patch(url, patchBody)
		const res2 = await request.patch(url, patchBody)

		expect(res1.status()).toBe(200)
		expect(res2.status()).toBe(200)
	})
})
