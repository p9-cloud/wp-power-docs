/**
 * [P0] 相容性遷移 — compatibility.spec.ts
 *
 * 驗證 RunCompatibilityMigration 邏輯
 * 依據：spec/features/compatibility/相容性遷移.feature
 *
 * 情境矩陣：
 * - 新建子章節（不指定 editor）→ 預設 power-editor
 * - 明確設定 editor=elementor → 保持 elementor
 * - 切換 elementor → power-editor → 成功，editor 變更
 * - 根知識庫（parent=0）editor 為空字串（使用首頁預設版型）
 * - 深度 2 的子章節預設也是 power-editor
 * - editor 為未知值 → 不拋 500（系統容錯）
 */
import { test, expect } from '@playwright/test'
import { wpGet, wpPost, wpDelete, type ApiOptions } from '../helpers/api-client.js'
import { getNonce, getSetupIds } from '../global-setup.js'
import { API } from '../fixtures/test-data.js'

test.describe('[P0] 相容性遷移 — editor 預設值邏輯', () => {
	let opts: ApiOptions

	test.beforeAll(async ({ request }, workerInfo) => {
		const baseURL = workerInfo.project.use.baseURL || 'http://localhost:8893'
		const nonce = getNonce()
		opts = { request, baseURL, nonce }
	})

	// ── 正常路徑 ────────────────────────────────

	test('[P0] 新建子章節（不指定 editor）— 預設 power-editor', async () => {
		const ids = getSetupIds()

		const { data } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 相容性-預設 editor 章節',
			post_parent: ids.docId,
			status: 'publish',
		})
		const chapterId = Number(data.id)

		try {
			const { data: detail } = await wpGet<{ editor?: string }>(opts, `${API.posts}/${chapterId}`)
			// spec 規則：子章節 editor 為空時預設回傳 power-editor
			expect(detail.editor).toBe('power-editor')
		} finally {
			await wpDelete(opts, `${API.posts}/${chapterId}`).catch(() => {})
		}
	})

	test('[P0] 明確設定 editor=elementor — 查詢時保持 elementor', async ({ request }) => {
		const ids = getSetupIds()

		const { data } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 相容性-Elementor 章節',
			post_parent: ids.docId,
			status: 'publish',
		})
		const chapterId = Number(data.id)

		try {
			await request.patch(
				`${opts.baseURL}/wp-json/${API.posts}/${chapterId}`,
				{
					headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
					data: { editor: 'elementor' },
				},
			)

			const { data: detail } = await wpGet<{ editor?: string }>(opts, `${API.posts}/${chapterId}`)
			expect(detail.editor).toBe('elementor')
		} finally {
			await wpDelete(opts, `${API.posts}/${chapterId}`).catch(() => {})
		}
	})

	test('[P0] 切換 elementor → power-editor — editor 變更', async ({ request }) => {
		const ids = getSetupIds()

		const { data } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 相容性-切換 Editor',
			post_parent: ids.docId,
			status: 'publish',
		})
		const chapterId = Number(data.id)

		try {
			// 先設為 elementor
			await request.patch(
				`${opts.baseURL}/wp-json/${API.posts}/${chapterId}`,
				{
					headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
					data: { editor: 'elementor' },
				},
			)

			// 再切回 power-editor
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
		} finally {
			await wpDelete(opts, `${API.posts}/${chapterId}`).catch(() => {})
		}
	})

	test('[P0] 根知識庫（parent=0）editor 為空字串 — 使用首頁預設版型', async () => {
		const ids = getSetupIds()
		const { data: detail } = await wpGet<{ editor?: string | null }>(opts, `${API.posts}/${ids.docId}`)

		// 根知識庫的 editor 應為空字串（使用首頁預設版型，非 power-editor）
		const isEmpty = detail.editor === '' || detail.editor === undefined || detail.editor === null
		expect(isEmpty).toBe(true)
	})

	test('[P1] 深度 2 子章節（單元）預設也是 power-editor', async () => {
		const ids = getSetupIds()

		// 建立父章節
		const { data: parent } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 相容性-父章節',
			post_parent: ids.docId,
			status: 'publish',
		})
		const parentChapterId = Number(parent.id)

		// 建立深度 2 子章節
		const { data: child } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 相容性-深度 2 子章節',
			post_parent: parentChapterId,
			status: 'publish',
		})
		const childId = Number(child.id)

		try {
			const { data: detail } = await wpGet<{ editor?: string }>(opts, `${API.posts}/${childId}`)
			expect(detail.editor).toBe('power-editor')
		} finally {
			await wpDelete(opts, `${API.posts}/${childId}`).catch(() => {})
			await wpDelete(opts, `${API.posts}/${parentChapterId}`).catch(() => {})
		}
	})

	test('[P2] 重複切換 editor（power-editor → elementor → power-editor）— 最終正確', async ({ request }) => {
		const ids = getSetupIds()

		const { data } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 相容性-多次切換',
			post_parent: ids.docId,
			status: 'publish',
		})
		const chapterId = Number(data.id)

		try {
			const toggle = async (editor: string) => {
				const res = await request.patch(
					`${opts.baseURL}/wp-json/${API.posts}/${chapterId}`,
					{
						headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
						data: { editor },
					},
				)
				expect(res.status()).toBe(200)
			}

			await toggle('power-editor')
			await toggle('elementor')
			await toggle('power-editor')

			const { data: detail } = await wpGet<{ editor?: string }>(opts, `${API.posts}/${chapterId}`)
			expect(detail.editor).toBe('power-editor')
		} finally {
			await wpDelete(opts, `${API.posts}/${chapterId}`).catch(() => {})
		}
	})

	test('[P3] editor 為未知值 — 不拋 500', async ({ request }) => {
		const ids = getSetupIds()

		const { data } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 相容性-未知 editor',
			post_parent: ids.docId,
			status: 'publish',
		})
		const chapterId = Number(data.id)

		try {
			const res = await request.patch(
				`${opts.baseURL}/wp-json/${API.posts}/${chapterId}`,
				{
					headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
					data: { editor: 'unknown-editor-xyz' },
				},
			)

			expect(res.status()).toBeLessThan(500)
		} finally {
			await wpDelete(opts, `${API.posts}/${chapterId}`).catch(() => {})
		}
	})
})
