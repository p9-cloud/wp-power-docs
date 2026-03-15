/**
 * [P0] 排序章節 — chapter-sort.spec.ts
 *
 * 驗證 POST /v2/powerhouse/posts/sort
 * 依據：spec/features/doc/排序章節.feature
 *
 * 情境矩陣：
 * - 交換兩個章節順序 → menu_order 正確更新
 * - 移動章節到另一父節點 → post_parent 更新
 * - 缺少 to_tree → 400
 * - 缺少 from_tree → 400
 * - from_tree 和 to_tree 相同 → 仍應成功（或 200 but noop）
 * - 空陣列 → 不造成 500
 * - 非陣列值 → 400
 */
import { test, expect } from '@playwright/test'
import { wpGet, wpPost, wpDelete, type ApiOptions } from '../helpers/api-client.js'
import { getNonce } from '../global-setup.js'
import { API } from '../fixtures/test-data.js'

test.describe('[P0] 排序章節', () => {
	let opts: ApiOptions
	let parentId: number
	let childA: number
	let childB: number

	test.beforeAll(async ({ request }, workerInfo) => {
		const baseURL = workerInfo.project.use.baseURL || 'http://localhost:8893'
		const nonce = getNonce()
		opts = { request, baseURL, nonce }

		// 建立父知識庫 + 兩個子章節
		const { data: parent } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 排序-父知識庫',
			status: 'publish',
		})
		parentId = Number(parent.id)

		const { data: a } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 排序-章節 A',
			post_parent: parentId,
			status: 'publish',
		})
		childA = Number(a.id)

		const { data: b } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 排序-章節 B',
			post_parent: parentId,
			status: 'publish',
		})
		childB = Number(b.id)
	})

	test.afterAll(async () => {
		for (const id of [childB, childA, parentId]) {
			await wpDelete(opts, `${API.posts}/${id}`).catch(() => {})
		}
	})

	// ── 正常路徑 ────────────────────────────────

	test('[P0] 交換兩個章節順序 — 回傳 200', async () => {
		const from_tree = [
			{ id: String(childA), parent_id: String(parentId), order: 0 },
			{ id: String(childB), parent_id: String(parentId), order: 1 },
		]
		const to_tree = [
			{ id: String(childB), parent_id: String(parentId), order: 0 },
			{ id: String(childA), parent_id: String(parentId), order: 1 },
		]

		const { status } = await wpPost(opts, API.postsSort, { from_tree, to_tree })
		expect(status).toBe(200)
	})

	test('[P0] 排序後 menu_order 正確反映', async () => {
		// 確保 A=0, B=1
		await wpPost(opts, API.postsSort, {
			from_tree: [
				{ id: String(childB), parent_id: String(parentId), order: 0 },
				{ id: String(childA), parent_id: String(parentId), order: 1 },
			],
			to_tree: [
				{ id: String(childA), parent_id: String(parentId), order: 0 },
				{ id: String(childB), parent_id: String(parentId), order: 1 },
			],
		})

		const { data: detailA } = await wpGet<{ menu_order?: number }>(opts, `${API.posts}/${childA}`)
		const { data: detailB } = await wpGet<{ menu_order?: number }>(opts, `${API.posts}/${childB}`)

		expect(Number(detailA.menu_order)).toBe(0)
		expect(Number(detailB.menu_order)).toBe(1)
	})

	test('[P0] 移動章節到另一父節點 — post_parent 更新', async () => {
		const { data: parent2 } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 排序-父知識庫 2',
			status: 'publish',
		})
		const parent2Id = Number(parent2.id)

		try {
			const { status } = await wpPost(opts, API.postsSort, {
				from_tree: [
					{ id: String(childA), parent_id: String(parentId), order: 0 },
					{ id: String(childB), parent_id: String(parentId), order: 1 },
				],
				to_tree: [
					{ id: String(childA), parent_id: String(parentId), order: 0 },
					{ id: String(childB), parent_id: String(parent2Id), order: 0 },
				],
			})

			expect(status).toBe(200)

			const { data: detailB } = await wpGet<{ parent_id?: number }>(opts, `${API.posts}/${childB}`)
			expect(String(detailB.parent_id)).toBe(String(parent2Id))

			// 移回原處
			await wpPost(opts, API.postsSort, {
				from_tree: [{ id: String(childB), parent_id: String(parent2Id), order: 0 }],
				to_tree: [{ id: String(childB), parent_id: String(parentId), order: 1 }],
			})
		} finally {
			await wpDelete(opts, `${API.posts}/${parent2Id}`).catch(() => {})
		}
	})

	// ── 邊界：缺少參數 ───────────────────────────

	test('[P1] 缺少 to_tree — 回傳 400', async () => {
		const { status } = await wpPost(opts, API.postsSort, {
			from_tree: [{ id: String(childA), parent_id: String(parentId), order: 0 }],
		})

		expect(status).toBe(400)
	})

	test('[P1] 缺少 from_tree — 回傳 400', async () => {
		const { status } = await wpPost(opts, API.postsSort, {
			to_tree: [{ id: String(childA), parent_id: String(parentId), order: 0 }],
		})

		expect(status).toBe(400)
	})

	test('[P2] 空陣列 from_tree 和 to_tree — 不造成 500', async () => {
		const { status } = await wpPost(opts, API.postsSort, {
			from_tree: [],
			to_tree: [],
		})

		expect(status).toBeLessThan(500)
	})

	test('[P2] from_tree 和 to_tree 相同 — 不造成 500', async () => {
		const sameTree = [
			{ id: String(childA), parent_id: String(parentId), order: 0 },
			{ id: String(childB), parent_id: String(parentId), order: 1 },
		]

		const { status } = await wpPost(opts, API.postsSort, {
			from_tree: sameTree,
			to_tree: sameTree,
		})

		// spec 規則：相同樹不應送出，但若送出也不應造成錯誤
		expect(status).toBeLessThan(500)
	})

	test('[P3] to_tree 帶有不存在的 ID — 不造成 500', async () => {
		const { status } = await wpPost(opts, API.postsSort, {
			from_tree: [{ id: String(childA), parent_id: String(parentId), order: 0 }],
			to_tree: [{ id: '999999', parent_id: String(parentId), order: 0 }],
		})

		expect(status).toBeLessThan(500)
	})

	test('[P3] order 為負數 — 不造成 500', async () => {
		const { status } = await wpPost(opts, API.postsSort, {
			from_tree: [{ id: String(childA), parent_id: String(parentId), order: 0 }],
			to_tree: [{ id: String(childA), parent_id: String(parentId), order: -1 }],
		})

		expect(status).toBeLessThan(500)
	})
})
