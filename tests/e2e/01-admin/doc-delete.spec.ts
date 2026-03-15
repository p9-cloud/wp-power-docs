/**
 * [P0] 刪除知識庫 — doc-delete.spec.ts
 *
 * 驗證 DELETE /v2/powerhouse/posts/{id}
 * 依據：spec/features/doc/刪除知識庫.feature
 *
 * 情境矩陣：
 * - 單筆刪除 → 200，查詢回 404
 * - 含子章節的知識庫：先刪子再刪父
 * - 刪除後再刪同 ID → 404
 * - 刪除不存在 ID → 404
 * - 刪除 ID=0, -1 → 400/404
 * - 批量刪除多個章節
 * - 已刪除資源的殘留存取
 */
import { test, expect } from '@playwright/test'
import { wpGet, wpPost, wpDelete, type ApiOptions } from '../helpers/api-client.js'
import { getNonce } from '../global-setup.js'
import { API } from '../fixtures/test-data.js'

test.describe('[P0] 刪除知識庫', () => {
	let opts: ApiOptions

	test.beforeAll(async ({ request }, workerInfo) => {
		const baseURL = workerInfo.project.use.baseURL || 'http://localhost:8893'
		const nonce = getNonce()
		opts = { request, baseURL, nonce }
	})

	// ── 正常路徑 ────────────────────────────────

	test('[P0] 單筆刪除知識庫 — 回傳 200，查詢後 404', async () => {
		const { data } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 刪除-單筆測試',
		})
		const id = Number(data.id)
		expect(id).toBeGreaterThan(0)

		const { status: deleteStatus } = await wpDelete(opts, `${API.posts}/${id}`)
		expect(deleteStatus).toBe(200)

		// 刪除後查詢應回 404
		const { status: getStatus } = await wpGet(opts, `${API.posts}/${id}`)
		expect(getStatus).toBe(404)
	})

	test('[P0] 刪除含子章節的知識庫 — 先刪子再刪父均成功', async () => {
		const { data: parentData } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 刪除-含子章節父知識庫',
		})
		const parentId = Number(parentData.id)

		const { data: childData } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 刪除-子章節',
			post_parent: parentId,
		})
		const childId = Number(childData.id)

		// 先刪子章節
		await wpDelete(opts, `${API.posts}/${childId}`)
		// 再刪父知識庫
		const { status } = await wpDelete(opts, `${API.posts}/${parentId}`)
		expect(status).toBe(200)

		const { status: parentStatus } = await wpGet(opts, `${API.posts}/${parentId}`)
		expect(parentStatus).toBe(404)
	})

	test('[P0] 批量刪除三個知識庫 — 均成功且查詢後均 404', async () => {
		const ids: number[] = []
		for (let i = 1; i <= 3; i++) {
			const { data } = await wpPost<{ id: number }>(opts, API.posts, {
				post_type: 'pd_doc',
				name: `E2E 批量刪除 ${i}`,
			})
			ids.push(Number(data.id))
		}

		for (const id of ids) {
			const { status } = await wpDelete(opts, `${API.posts}/${id}`)
			expect(status).toBe(200)
		}

		for (const id of ids) {
			const { status } = await wpGet(opts, `${API.posts}/${id}`)
			expect(getStatus => getStatus).toBeTruthy()
			expect(status).toBe(404)
		}
	})

	// ── 邊界：不存在 ID ───────────────────────────

	test('[P1] 刪除不存在的知識庫 — 回傳 404', async () => {
		const { status } = await wpDelete(opts, `${API.posts}/999999`)
		expect(status).toBe(404)
	})

	test('[P1] 刪除後再刪同 ID — 第二次回傳 404', async () => {
		const { data } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 刪除-重複刪除測試',
		})
		const id = Number(data.id)

		// 第一次刪除
		const { status: s1 } = await wpDelete(opts, `${API.posts}/${id}`)
		expect(s1).toBe(200)

		// 第二次刪除同一 ID
		const { status: s2 } = await wpDelete(opts, `${API.posts}/${id}`)
		expect(s2).toBe(404)
	})

	test('[P1] 刪除 ID=0 — 回傳 400 或 404', async () => {
		const { status } = await wpDelete(opts, `${API.posts}/0`)
		expect([400, 404]).toContain(status)
	})

	test('[P1] 刪除負數 ID — 回傳 400 或 404', async () => {
		const { status } = await wpDelete(opts, `${API.posts}/-1`)
		expect([400, 404]).toContain(status)
	})

	test('[P2] 刪除非數字 ID — 不造成 500', async () => {
		const { status } = await wpDelete(opts, `${API.posts}/abc`)
		expect(status).toBeLessThan(500)
	})

	test('[P2] 刪除超大整數 ID — 不造成 500', async () => {
		const { status } = await wpDelete(opts, `${API.posts}/${Number.MAX_SAFE_INTEGER}`)
		expect(status).toBeLessThan(500)
	})

	// ── 已刪除資源殘留存取 ───────────────────────

	test('[P2] 已刪除知識庫的前台 URL — 不造成 500', async ({ page }) => {
		const { data } = await wpPost<{ id: number; slug?: string }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 刪除-殘留存取測試',
			status: 'publish',
		})
		const id = Number(data.id)

		// 取得 slug
		const { data: detail } = await wpGet<{ slug?: string }>(opts, `${API.posts}/${id}`)
		const slug = detail.slug

		// 刪除
		await wpDelete(opts, `${API.posts}/${id}`)

		if (slug) {
			// 訪問已刪除知識庫的前台 URL
			const response = await page.goto(`/pd_doc/${slug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})
			// 應回傳 404，不應是 500
			expect(response?.status()).not.toBe(500)
		}
	})
})
