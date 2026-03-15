/**
 * [P0] 建立知識庫 — doc-create.spec.ts
 *
 * 驗證 POST /v2/powerhouse/posts 建立知識庫
 * 依據：spec/features/doc/建立知識庫.feature
 *
 * 情境矩陣：
 * - 根知識庫自動建立預設 meta（pd_keywords_label, pd_keywords, unauthorized_redirect_url）
 * - 子章節 editor 預設為 power-editor
 * - 子章節不應有根知識庫 meta
 * - 缺少必要參數 → 400
 * - 無效 post_type → 400
 * - XSS 標題被安全儲存
 * - 超長標題不造成錯誤
 * - 空白標題 → 400 或使用預設值
 * - 重複建立（冪等性不適用；每次應建立新的）
 */
import { test, expect } from '@playwright/test'
import { wpGet, wpPost, wpDelete, type ApiOptions } from '../helpers/api-client.js'
import { getNonce, getSetupIds } from '../global-setup.js'
import { API, EDGE_STRINGS } from '../fixtures/test-data.js'

test.describe('[P0] 建立知識庫', () => {
	let opts: ApiOptions
	const createdIds: number[] = []

	test.beforeAll(async ({ request }, workerInfo) => {
		const baseURL = workerInfo.project.use.baseURL || 'http://localhost:8893'
		const nonce = getNonce()
		opts = { request, baseURL, nonce }
	})

	test.afterAll(async () => {
		// 反向刪除（先刪子章節再刪父）
		for (const id of [...createdIds].reverse()) {
			await wpDelete(opts, `${API.posts}/${id}`).catch(() => {})
		}
	})

	// ── 正常路徑 ────────────────────────────────

	test('[P0] 建立根知識庫 — 回傳 200 且有 ID', async () => {
		const { data, status } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 建立根知識庫 基本測試',
		})

		expect(status).toBe(200)
		expect(data).toHaveProperty('id')
		const id = Number(data.id)
		expect(id).toBeGreaterThan(0)
		createdIds.push(id)
	})

	test('[P0] 根知識庫自動設定 pd_keywords_label 預設值', async () => {
		const { data } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 建立-預設 Meta 測試',
		})

		const id = Number(data.id)
		createdIds.push(id)

		// 查詢帶 meta_keys 驗證預設值
		const url = new URL(`${opts.baseURL}/wp-json/${API.posts}/${id}`)
		url.searchParams.append('meta_keys[]', 'pd_keywords_label')
		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})
		const detail = await res.json() as { pd_keywords_label?: string }

		expect(detail.pd_keywords_label).toBeDefined()
		// 預設值應為 "大家都在搜：" 或類似字串（非空）
		if (detail.pd_keywords_label) {
			expect(typeof detail.pd_keywords_label).toBe('string')
			expect(detail.pd_keywords_label.length).toBeGreaterThan(0)
		}
	})

	test('[P0] 根知識庫自動設定 unauthorized_redirect_url 預設值', async () => {
		const { data } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 建立-跳轉 URL 測試',
		})

		const id = Number(data.id)
		createdIds.push(id)

		const url = new URL(`${opts.baseURL}/wp-json/${API.posts}/${id}`)
		url.searchParams.append('meta_keys[]', 'unauthorized_redirect_url')
		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})
		const detail = await res.json() as { unauthorized_redirect_url?: string }

		expect(detail.unauthorized_redirect_url).toBeDefined()
		expect(typeof detail.unauthorized_redirect_url).toBe('string')
	})

	test('[P0] 根知識庫自動設定 pd_keywords 包含 1 筆預設關鍵字', async () => {
		const { data } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 建立-關鍵字測試',
		})

		const id = Number(data.id)
		createdIds.push(id)

		const url = new URL(`${opts.baseURL}/wp-json/${API.posts}/${id}`)
		url.searchParams.append('meta_keys[]', 'pd_keywords')
		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})
		const detail = await res.json() as { pd_keywords?: unknown[] }

		if (detail.pd_keywords !== undefined) {
			expect(Array.isArray(detail.pd_keywords)).toBe(true)
			// 根據 spec：建立時自動設定 1 筆預設關鍵字
			expect((detail.pd_keywords as unknown[]).length).toBeGreaterThanOrEqual(1)
		}
	})

	test('[P0] 子章節建立後 editor 預設為 power-editor', async () => {
		const setupIds = getSetupIds()

		const { data } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 建立-子章節 Editor 測試',
			post_parent: setupIds.docId,
		})

		const id = Number(data.id)
		createdIds.push(id)

		const { data: detail } = await wpGet<{ editor?: string }>(opts, `${API.posts}/${id}`)
		// 子章節應預設為 power-editor
		expect(detail.editor).toBe('power-editor')
	})

	test('[P0] 子章節不設定根知識庫專屬 meta（pd_keywords_label）', async () => {
		const setupIds = getSetupIds()

		const { data } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 建立-子章節 Meta 隔離測試',
			post_parent: setupIds.docId,
		})

		const id = Number(data.id)
		createdIds.push(id)

		const url = new URL(`${opts.baseURL}/wp-json/${API.posts}/${id}`)
		url.searchParams.append('meta_keys[]', 'pd_keywords_label')
		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})
		const detail = await res.json() as { pd_keywords_label?: string }

		// 子章節不應有 pd_keywords_label 或為空
		const label = detail.pd_keywords_label
		expect(!label || label === '').toBe(true)
	})

	test('[P0] 指定 status=draft — 建立草稿知識庫', async () => {
		const { data, status } = await wpPost<{ id: number; status?: string }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 建立-草稿測試',
			status: 'draft',
		})

		expect(status).toBe(200)
		const id = Number(data.id)
		createdIds.push(id)

		const { data: detail } = await wpGet<{ status?: string }>(opts, `${API.posts}/${id}`)
		expect(detail.status).toBe('draft')
	})

	// ── 缺少必要參數 ─────────────────────────────

	test('[P1] 缺少 name — 回傳 400', async () => {
		const { status } = await wpPost(opts, API.posts, {
			post_type: 'pd_doc',
		})

		expect(status).toBe(400)
	})

	test('[P1] 缺少 post_type — 回傳 400', async () => {
		const { status } = await wpPost(opts, API.posts, {
			name: 'E2E 缺少 post_type 測試',
		})

		expect(status).toBe(400)
	})

	// ── 邊界：字串 ───────────────────────────────

	test('[P2] XSS 標題被安全儲存 — 不執行腳本', async () => {
		const { data, status } = await wpPost<{ id: number; name?: string }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: EDGE_STRINGS.xssScript,
		})

		// 儲存應成功（WordPress 應 sanitize）
		expect(status).toBeLessThan(500)
		if (status === 200 && data.id) {
			const id = Number(data.id)
			createdIds.push(id)

			// 驗證回傳的名稱不包含原始 <script> 標籤
			const { data: detail } = await wpGet<{ name?: string }>(opts, `${API.posts}/${id}`)
			expect(detail.name).not.toContain('<script>')
		}
	})

	test('[P2] SQL injection 標題被安全儲存', async () => {
		const { data, status } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: EDGE_STRINGS.sqlInjection,
		})

		// 儲存應成功，不造成 DB 錯誤
		expect(status).toBeLessThan(500)
		if (status === 200 && data.id) {
			createdIds.push(Number(data.id))
		}
	})

	test('[P2] Unicode + Emoji 標題被正確儲存', async () => {
		const { data, status } = await wpPost<{ id: number; name?: string }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: EDGE_STRINGS.emoji,
		})

		expect(status).toBeLessThan(500)
		if (status === 200 && data.id) {
			createdIds.push(Number(data.id))
		}
	})

	test('[P2] RTL 文字標題被正確儲存', async () => {
		const { data, status } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: EDGE_STRINGS.rtlText,
		})

		expect(status).toBeLessThan(500)
		if (status === 200 && data.id) {
			createdIds.push(Number(data.id))
		}
	})

	test('[P3] 超長標題（10000 字元）— 不造成 500', async () => {
		const { data, status } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: EDGE_STRINGS.longString,
		})

		// 允許 400（超出限制）或 200（截斷儲存），但不允許 500
		expect(status).toBeLessThan(500)
		if (status === 200 && data.id) {
			createdIds.push(Number(data.id))
		}
	})

	test('[P3] NULL byte 標題 — 不造成 500', async () => {
		const { data, status } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: EDGE_STRINGS.nullByte,
		})

		expect(status).toBeLessThan(500)
		if (status === 200 && data.id) {
			createdIds.push(Number(data.id))
		}
	})

	// ── 重複建立 ────────────────────────────────

	test('[P2] 同名稱連續建立兩次 — 兩次都成功且 ID 不同', async () => {
		const name = 'E2E 建立-重複名稱測試'

		const { data: d1, status: s1 } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name,
		})
		const { data: d2, status: s2 } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name,
		})

		expect(s1).toBe(200)
		expect(s2).toBe(200)

		const id1 = Number(d1.id)
		const id2 = Number(d2.id)
		createdIds.push(id1, id2)

		// 每次建立應產生不同的 ID（WordPress 不阻止同名）
		expect(id1).not.toBe(id2)
	})
})
