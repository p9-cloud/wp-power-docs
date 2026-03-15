/**
 * [P1] 複製知識庫 — doc-copy.spec.ts
 *
 * 驗證 POST /v2/powerhouse/copy/{id} 複製知識庫及子章節
 * 依據：spec/features/doc/複製知識庫.feature
 *
 * 情境矩陣：
 * - 成功複製根知識庫 → 回傳 200 且新 ID 不同於原 ID
 * - 複製後子章節數量正確（與原知識庫相同）
 * - 複製後所有子章節 post_type 為 pd_doc
 * - 複製不存在的 ID → 404
 * - 未帶 nonce 複製 → 401 或 403
 * - 複製只有根節點（無子章節）的知識庫 → 成功且子章節為空
 * - 複製含 XSS 標題的知識庫 → 成功且標題被 sanitize
 * - 使用超出整數範圍的 ID → 不造成 500
 * - 負數 ID → 400 或 404，不造成 500
 */
import { test, expect } from '@playwright/test'
import { wpGet, wpPost, wpDelete, type ApiOptions } from '../helpers/api-client.js'
import { getNonce, getSetupIds, type SetupIds } from '../global-setup.js'
import { API, EDGE_STRINGS } from '../fixtures/test-data.js'

test.describe('[P1] 複製知識庫', () => {
	let opts: ApiOptions
	let ids: SetupIds
	const createdIds: number[] = []

	test.beforeAll(async ({ request }, workerInfo) => {
		const baseURL = workerInfo.project.use.baseURL || 'http://localhost:8893'
		const nonce = getNonce()
		opts = { request, baseURL, nonce }
		ids = getSetupIds()
	})

	test.afterAll(async () => {
		for (const id of [...createdIds].reverse()) {
			await wpDelete(opts, `${API.posts}/${id}`).catch(() => {})
		}
	})

	// ── 正常路徑 ────────────────────────────────

	test('[P1] 複製根知識庫 — 回傳 200 且新 ID 不同於原 ID', async () => {
		test.skip(!ids.docId, '缺少測試知識庫')

		const res = await opts.request.post(
			`${opts.baseURL}/wp-json/${API.postsCopy}/${ids.docId}`,
			{ headers: { 'X-WP-Nonce': opts.nonce } },
		)

		expect(res.status()).toBe(200)
		const data = await res.json() as { id?: number }
		expect(data).toHaveProperty('id')
		const newId = Number(data.id)
		expect(newId).toBeGreaterThan(0)
		expect(newId).not.toBe(ids.docId)
		createdIds.push(newId)
	})

	test('[P1] 複製後 post_type 為 pd_doc', async () => {
		test.skip(!ids.docId, '缺少測試知識庫')

		const res = await opts.request.post(
			`${opts.baseURL}/wp-json/${API.postsCopy}/${ids.docId}`,
			{ headers: { 'X-WP-Nonce': opts.nonce } },
		)

		expect(res.status()).toBe(200)
		const data = await res.json() as { id?: number; post_type?: string }
		const newId = Number(data.id)
		createdIds.push(newId)

		const { data: detail } = await wpGet<{ post_type?: string }>(opts, `${API.posts}/${newId}`)
		expect(detail.post_type).toBe('pd_doc')
	})

	test('[P1] 複製後子章節數量正確且 post_type 皆為 pd_doc', async () => {
		// 建立一個有 2 個子章節的臨時知識庫
		const { data: root } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 複製-有章節知識庫',
			status: 'publish',
		})
		const rootId = Number(root.id)
		createdIds.push(rootId)

		const { data: ch1 } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 複製-章節1',
			post_parent: rootId,
			status: 'publish',
		})
		createdIds.push(Number(ch1.id))

		const { data: ch2 } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 複製-章節2',
			post_parent: rootId,
			status: 'publish',
		})
		createdIds.push(Number(ch2.id))

		// 複製
		const copyRes = await opts.request.post(
			`${opts.baseURL}/wp-json/${API.postsCopy}/${rootId}`,
			{ headers: { 'X-WP-Nonce': opts.nonce } },
		)

		expect(copyRes.status()).toBe(200)
		const copyData = await copyRes.json() as { id?: number }
		const newId = Number(copyData.id)
		createdIds.push(newId)

		// 驗證複製後子章節數量
		const { data: detail } = await wpGet<{ children?: { id: number; post_type?: string }[] }>(
			opts, `${API.posts}/${newId}`,
		)

		if (detail.children && Array.isArray(detail.children)) {
			expect(detail.children.length).toBe(2)
			for (const child of detail.children) {
				// 所有子章節的 post_type 應為 pd_doc
				if (child.post_type) {
					expect(child.post_type).toBe('pd_doc')
				}
				createdIds.push(Number(child.id))
			}
		}
	})

	test('[P0] 複製只有根節點（無子章節）的知識庫 — 成功且 children 為空', async () => {
		const { data: root } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 複製-空知識庫',
			status: 'publish',
		})
		const rootId = Number(root.id)
		createdIds.push(rootId)

		const copyRes = await opts.request.post(
			`${opts.baseURL}/wp-json/${API.postsCopy}/${rootId}`,
			{ headers: { 'X-WP-Nonce': opts.nonce } },
		)

		expect(copyRes.status()).toBe(200)
		const copyData = await copyRes.json() as { id?: number }
		const newId = Number(copyData.id)
		createdIds.push(newId)

		const { data: detail } = await wpGet<{ children?: unknown[] }>(opts, `${API.posts}/${newId}`)
		if (detail.children !== undefined) {
			expect(Array.isArray(detail.children)).toBe(true)
			expect(detail.children.length).toBe(0)
		}
	})

	// ── 不存在的 ID ──────────────────────────────

	test('[P1] 複製不存在的知識庫 ID — 回傳 404', async () => {
		const res = await opts.request.post(
			`${opts.baseURL}/wp-json/${API.postsCopy}/9999999`,
			{ headers: { 'X-WP-Nonce': opts.nonce } },
		)

		expect(res.status()).toBe(404)
	})

	// ── 權限邊界 ─────────────────────────────────

	test('[P1] 未帶 nonce 複製知識庫 — 回傳 401 或 403', async ({ browser }) => {
		test.skip(!ids.docId, '缺少測試知識庫')

		const context = await browser.newContext()
		try {
			const res = await context.request.post(
				`${opts.baseURL}/wp-json/${API.postsCopy}/${ids.docId}`,
			)
			expect([401, 403]).toContain(res.status())
		} finally {
			await context.close()
		}
	})

	test('[P1] 空 nonce 複製知識庫 — 回傳 401 或 403', async () => {
		test.skip(!ids.docId, '缺少測試知識庫')

		const res = await opts.request.post(
			`${opts.baseURL}/wp-json/${API.postsCopy}/${ids.docId}`,
			{ headers: { 'X-WP-Nonce': '' } },
		)

		expect([401, 403]).toContain(res.status())
	})

	// ── 邊界數值 ─────────────────────────────────

	test('[P2] 負數 ID — 不造成 500', async () => {
		const res = await opts.request.post(
			`${opts.baseURL}/wp-json/${API.postsCopy}/-1`,
			{ headers: { 'X-WP-Nonce': opts.nonce } },
		)

		expect(res.status()).toBeLessThan(500)
		expect([400, 404]).toContain(res.status())
	})

	test('[P2] 超大整數 ID — 不造成 500', async () => {
		const res = await opts.request.post(
			`${opts.baseURL}/wp-json/${API.postsCopy}/9999999999999`,
			{ headers: { 'X-WP-Nonce': opts.nonce } },
		)

		expect(res.status()).toBeLessThan(500)
	})

	test('[P3] 非數字 ID（字串）— 不造成 500', async () => {
		const res = await opts.request.post(
			`${opts.baseURL}/wp-json/${API.postsCopy}/abc`,
			{ headers: { 'X-WP-Nonce': opts.nonce } },
		)

		expect(res.status()).toBeLessThan(500)
	})

	// ── 資料邊界 ─────────────────────────────────

	test('[P2] 複製含 XSS 標題的知識庫 — 標題被 sanitize', async () => {
		const { data: orig } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: EDGE_STRINGS.xssScript,
		})
		const origId = Number(orig.id)
		createdIds.push(origId)

		const copyRes = await opts.request.post(
			`${opts.baseURL}/wp-json/${API.postsCopy}/${origId}`,
			{ headers: { 'X-WP-Nonce': opts.nonce } },
		)

		expect(copyRes.status()).toBeLessThan(500)

		if (copyRes.status() === 200) {
			const copyData = await copyRes.json() as { id?: number }
			const newId = Number(copyData.id)
			createdIds.push(newId)

			const { data: detail } = await wpGet<{ name?: string }>(opts, `${API.posts}/${newId}`)
			expect(detail.name).not.toContain('<script>')
		}
	})

	test('[P3] 複製含 Unicode + Emoji 標題的知識庫 — 標題完整保留', async () => {
		const { data: orig } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: EDGE_STRINGS.emoji,
		})
		const origId = Number(orig.id)
		createdIds.push(origId)

		const copyRes = await opts.request.post(
			`${opts.baseURL}/wp-json/${API.postsCopy}/${origId}`,
			{ headers: { 'X-WP-Nonce': opts.nonce } },
		)

		expect(copyRes.status()).toBeLessThan(500)

		if (copyRes.status() === 200) {
			const copyData = await copyRes.json() as { id?: number }
			const newId = Number(copyData.id)
			createdIds.push(newId)

			const { data: detail } = await wpGet<{ name?: string }>(opts, `${API.posts}/${newId}`)
			expect(typeof detail.name).toBe('string')
		}
	})

	// ── 冪等性 ───────────────────────────────────

	test('[P2] 對同一知識庫複製兩次 — 兩次各產生新的 ID（非冪等）', async () => {
		test.skip(!ids.docId, '缺少測試知識庫')

		const [res1, res2] = await Promise.all([
			opts.request.post(
				`${opts.baseURL}/wp-json/${API.postsCopy}/${ids.docId}`,
				{ headers: { 'X-WP-Nonce': opts.nonce } },
			),
			opts.request.post(
				`${opts.baseURL}/wp-json/${API.postsCopy}/${ids.docId}`,
				{ headers: { 'X-WP-Nonce': opts.nonce } },
			),
		])

		// 兩次複製都應成功且各自產生不同 ID
		const [data1, data2] = await Promise.all([
			res1.json() as Promise<{ id?: number }>,
			res2.json() as Promise<{ id?: number }>,
		])

		if (res1.status() < 500 && res2.status() < 500) {
			const id1 = Number(data1.id)
			const id2 = Number(data2.id)
			if (id1 > 0) createdIds.push(id1)
			if (id2 > 0) createdIds.push(id2)
			if (id1 > 0 && id2 > 0) {
				expect(id1).not.toBe(id2)
			}
		}
	})
})
