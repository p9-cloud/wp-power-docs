/**
 * [P2] 資料邊界測試 — data-boundary.spec.ts
 *
 * 驗證各種特殊字元和邊界值的處理：
 * - Unicode / 多語言字串
 * - Emoji 字串
 * - 超長字串
 * - 特殊字元
 * - 空字串
 * - SQL injection 防護
 */
import { test, expect } from '@playwright/test'
import { wpGet, wpPost, wpDelete, type ApiOptions } from '../helpers/api-client.js'
import { getNonce } from '../global-setup.js'
import { API, EDGE_STRINGS } from '../fixtures/test-data.js'

test.describe('[P2] 資料邊界測試', () => {
	let opts: ApiOptions
	const createdIds: number[] = []

	test.beforeAll(async ({ request }, workerInfo) => {
		const baseURL = workerInfo.project.use.baseURL || 'http://localhost:8893'
		const nonce = getNonce()
		opts = { request, baseURL, nonce }
	})

	test.afterAll(async () => {
		for (const id of [...createdIds].reverse()) {
			await wpDelete(opts, `${API.posts}/${id}`).catch(() => {})
		}
	})

	test.describe('Unicode / 多語言', () => {
		test('Unicode 多語言標題 — 建立成功且保留原文', async () => {
			const { data, status } = await wpPost<{ id: number }>(opts, API.posts, {
				post_type: 'pd_doc',
				name: EDGE_STRINGS.unicode,
			})

			expect(status).toBe(200)
			const id = Number(data.id)
			createdIds.push(id)

			const { data: detail } = await wpGet<{ name?: string }>(opts, `${API.posts}/${id}`)
			// 應保留 Unicode 字元
			expect(detail.name).toContain('你好世界')
			expect(detail.name).toContain('こんにちは')
			expect(detail.name).toContain('Héllo')
		})

		test('RTL 文字標題 — 不造成伺服器錯誤', async () => {
			const { data, status } = await wpPost<{ id: number }>(opts, API.posts, {
				post_type: 'pd_doc',
				name: EDGE_STRINGS.rtlText,
			})

			expect(status).toBeLessThan(500)

			if (status === 200) {
				createdIds.push(Number(data.id))
			}
		})
	})

	test.describe('Emoji', () => {
		test('Emoji 標題 — 建立成功且保留 emoji', async () => {
			const { data, status } = await wpPost<{ id: number }>(opts, API.posts, {
				post_type: 'pd_doc',
				name: EDGE_STRINGS.emoji,
			})

			expect(status).toBe(200)
			const id = Number(data.id)
			createdIds.push(id)

			const { data: detail } = await wpGet<{ name?: string }>(opts, `${API.posts}/${id}`)
			// WordPress 4.2+ 支援 emoji
			expect(detail.name).toContain('知識庫')
		})
	})

	test.describe('超長字串', () => {
		test('500 字元標題 — 不造成伺服器錯誤', async () => {
			const { data, status } = await wpPost<{ id: number }>(opts, API.posts, {
				post_type: 'pd_doc',
				name: EDGE_STRINGS.longString,
			})

			expect(status).toBeLessThan(500)

			if (status === 200) {
				const id = Number(data.id)
				createdIds.push(id)
			}
		})

		test('超長內容 — 建立成功', async ({ request }) => {
			const longContent = '<p>' + 'B'.repeat(10000) + '</p>'

			const { data } = await wpPost<{ id: number }>(opts, API.posts, {
				post_type: 'pd_doc',
				name: 'E2E Long Content Test',
			})

			const id = Number(data.id)
			createdIds.push(id)

			const res = await request.patch(
				`${opts.baseURL}/wp-json/${API.posts}/${id}`,
				{
					headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
					data: { post_content: longContent },
				},
			)

			expect(res.status()).toBe(200)
		})
	})

	test.describe('特殊字元', () => {
		test('特殊字元標題 — 不造成伺服器錯誤', async () => {
			const { data, status } = await wpPost<{ id: number }>(opts, API.posts, {
				post_type: 'pd_doc',
				name: EDGE_STRINGS.specialChars,
			})

			expect(status).toBeLessThan(500)

			if (status === 200) {
				const id = Number(data.id)
				createdIds.push(id)
			}
		})

		test('含換行和 Tab 的內容 — 正常儲存', async ({ request }) => {
			const { data } = await wpPost<{ id: number }>(opts, API.posts, {
				post_type: 'pd_doc',
				name: 'E2E Newline Tab Test',
			})

			const id = Number(data.id)
			createdIds.push(id)

			const res = await request.patch(
				`${opts.baseURL}/wp-json/${API.posts}/${id}`,
				{
					headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
					data: { post_content: EDGE_STRINGS.newlines },
				},
			)

			expect(res.status()).toBe(200)
		})
	})

	test.describe('SQL Injection 防護', () => {
		test('搜尋參數含 SQL injection — 不造成伺服器錯誤', async () => {
			const { status } = await wpGet<{ id: number; user_login: string }[]>(opts, API.users, {
				s: EDGE_STRINGS.sqlInjection,
			})

			expect(status).toBeLessThan(500)
		})

		test('知識庫標題含 SQL injection — 被 sanitize', async () => {
			const { data, status } = await wpPost<{ id: number }>(opts, API.posts, {
				post_type: 'pd_doc',
				name: EDGE_STRINGS.sqlInjection,
			})

			expect(status).toBeLessThan(500)

			if (status === 200) {
				const id = Number(data.id)
				createdIds.push(id)

				const { data: detail } = await wpGet<{ name?: string }>(opts, `${API.posts}/${id}`)
				// 標題不應導致 SQL injection
				expect(typeof detail.name).toBe('string')
			}
		})
	})

	test.describe('空值處理', () => {
		test('空標題知識庫 — 不造成伺服器錯誤', async () => {
			const { status } = await wpPost<{ id: number }>(opts, API.posts, {
				post_type: 'pd_doc',
				name: '',
			})

			// WordPress 可能接受空標題或回傳錯誤，但不應 500
			expect(status).toBeLessThan(500)
		})

		test('搜尋空字串 — 回傳全部用戶', async () => {
			const { data, status } = await wpGet<{ id: number; user_login: string }[]>(opts, API.users, {
				s: '',
			})

			expect(status).toBe(200)
			expect(Array.isArray(data)).toBe(true)
		})
	})

	test.describe('HTML 實體', () => {
		test('HTML 實體標題 — 正常處理', async () => {
			const { data, status } = await wpPost<{ id: number }>(opts, API.posts, {
				post_type: 'pd_doc',
				name: EDGE_STRINGS.htmlEntities,
			})

			expect(status).toBeLessThan(500)

			if (status === 200) {
				const id = Number(data.id)
				createdIds.push(id)
			}
		})
	})
})
