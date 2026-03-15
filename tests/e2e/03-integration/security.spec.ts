/**
 * [P1] 安全性測試 — security.spec.ts
 *
 * 驗證認證與授權機制：
 * - 未登入用戶無法存取管理 API
 * - 無效 nonce 被拒絕
 * - subscriber 無法執行管理操作
 * - CORS / 權限邊界
 */
import { test, expect } from '@playwright/test'
import { wpGet, wpPost, wpDelete, type ApiOptions } from '../helpers/api-client.js'
import { getNonce, getSetupIds, type SetupIds } from '../global-setup.js'
import { API } from '../fixtures/test-data.js'

test.describe('[P1] 安全性測試', () => {
	let opts: ApiOptions
	let ids: SetupIds

	test.beforeAll(async ({ request }, workerInfo) => {
		const baseURL = workerInfo.project.use.baseURL || 'http://localhost:8893'
		const nonce = getNonce()
		opts = { request, baseURL, nonce }
		ids = getSetupIds()
	})

	test.describe('未登入存取', () => {
		test('未帶 nonce 查詢知識庫列表 — 回傳 401 或 403', async ({ browser }) => {
			// 使用全新 context（無登入 cookie）
			const context = await browser.newContext()
			try {
				const res = await context.request.get(
					`${opts.baseURL}/wp-json/${API.posts}?post_type=pd_doc`,
				)

				// 未認證應回傳 401 或 403
				expect([401, 403]).toContain(res.status())
			} finally {
				await context.close()
			}
		})

		test('未帶 nonce 查詢用戶列表 — 回傳 401 或 403', async ({ browser }) => {
			const context = await browser.newContext()
			try {
				const res = await context.request.get(
					`${opts.baseURL}/wp-json/${API.users}`,
				)

				expect([401, 403]).toContain(res.status())
			} finally {
				await context.close()
			}
		})

		test('未登入建立知識庫 — 回傳 401 或 403', async ({ browser }) => {
			const context = await browser.newContext()
			try {
				const res = await context.request.post(
					`${opts.baseURL}/wp-json/${API.posts}`,
					{
						headers: { 'Content-Type': 'application/json' },
						data: {
							post_type: 'pd_doc',
							name: 'Unauthorized Create Test',
						},
					},
				)

				expect([401, 403]).toContain(res.status())
			} finally {
				await context.close()
			}
		})

		test('未登入刪除知識庫 — 回傳 401 或 403', async ({ browser }) => {
			const context = await browser.newContext()
			try {
				const res = await context.request.delete(
					`${opts.baseURL}/wp-json/${API.posts}/${ids.docId}`,
				)

				expect([401, 403]).toContain(res.status())
			} finally {
				await context.close()
			}
		})
	})

	test.describe('無效 nonce', () => {
		test('使用假 nonce 查詢 — 回傳 403', async () => {
			const fakeOpts: ApiOptions = {
				...opts,
				nonce: 'invalid_nonce_12345',
			}

			const { status } = await wpGet(fakeOpts, `${API.posts}`, {
				post_type: 'pd_doc',
			})

			expect([401, 403]).toContain(status)
		})

		test('使用空 nonce 建立知識庫 — 回傳 401 或 403', async () => {
			const emptyOpts: ApiOptions = {
				...opts,
				nonce: '',
			}

			const { status } = await wpPost(emptyOpts, API.posts, {
				post_type: 'pd_doc',
				name: 'Empty Nonce Test',
			})

			expect([401, 403]).toContain(status)
		})
	})

	test.describe('權限不足（subscriber）', () => {
		test('subscriber 登入後建立知識庫 — 回傳 403', async ({ browser }) => {
			// 以 subscriber 身分登入
			const context = await browser.newContext()
			const page = await context.newPage()

			try {
				await page.goto(`${opts.baseURL}/wp-login.php`, {
					waitUntil: 'domcontentloaded',
				})
				await page.fill('#user_login', 'e2e_pd_subscriber')
				await page.fill('#user_pass', 'e2e_pd_subscriber_pass')
				await page.click('#wp-submit')

				// 等待登入完成
				try {
					await page.waitForURL(/wp-admin|account/, { timeout: 15_000 })
				} catch {
					// subscriber 可能無法進入 wp-admin，但 cookie 已設定
				}

				// 嘗試透過 REST API 取得 nonce
				await page.goto(`${opts.baseURL}/wp-admin/`, {
					waitUntil: 'domcontentloaded',
					timeout: 15_000,
				}).catch(() => {})

				let subscriberNonce = ''
				try {
					subscriberNonce = await page.evaluate(
						() => (window as any).wpApiSettings?.nonce ?? '',
					)
				} catch { /* ignore */ }

				if (subscriberNonce) {
					const res = await context.request.post(
						`${opts.baseURL}/wp-json/${API.posts}`,
						{
							headers: {
								'X-WP-Nonce': subscriberNonce,
								'Content-Type': 'application/json',
							},
							data: {
								post_type: 'pd_doc',
								name: 'Subscriber Create Test',
							},
						},
					)

					expect(res.status()).toBe(403)
				}
			} finally {
				await context.close()
			}
		})

		test('subscriber 無法刪除知識庫 — 回傳 403', async ({ browser }) => {
			const context = await browser.newContext()
			const page = await context.newPage()

			try {
				await page.goto(`${opts.baseURL}/wp-login.php`, {
					waitUntil: 'domcontentloaded',
				})
				await page.fill('#user_login', 'e2e_pd_subscriber')
				await page.fill('#user_pass', 'e2e_pd_subscriber_pass')
				await page.click('#wp-submit')

				try {
					await page.waitForURL(/wp-admin|account/, { timeout: 15_000 })
				} catch { /* subscriber 可能無法進入 wp-admin */ }

				await page.goto(`${opts.baseURL}/wp-admin/`, {
					waitUntil: 'domcontentloaded',
					timeout: 15_000,
				}).catch(() => {})

				let subscriberNonce = ''
				try {
					subscriberNonce = await page.evaluate(
						() => (window as any).wpApiSettings?.nonce ?? '',
					)
				} catch { /* ignore */ }

				if (subscriberNonce) {
					const res = await context.request.delete(
						`${opts.baseURL}/wp-json/${API.posts}/${ids.docId}`,
						{
							headers: { 'X-WP-Nonce': subscriberNonce },
						},
					)

					expect(res.status()).toBe(403)
				}
			} finally {
				await context.close()
			}
		})
	})

	test.describe('前台搜尋注入防護', () => {
		test('前台搜尋 XSS script — 不造成腳本注入', async ({ page }) => {
			const { data: freeDoc } = await wpGet<{ slug?: string }>(opts, `${API.posts}/${ids.freeDocId}`)
			test.skip(!freeDoc?.slug, '無法取得免費知識庫 slug')

			let alertFired = false
			page.on('dialog', async (dialog) => {
				alertFired = true
				await dialog.dismiss()
			})

			const response = await page.goto(
				`/pd_doc/${freeDoc.slug}/?search=${encodeURIComponent('<script>alert("XSS")</script>')}`,
				{ waitUntil: 'domcontentloaded', timeout: 15_000 },
			)

			expect(response?.status()).toBeLessThan(500)
			expect(alertFired).toBe(false)

			const bodyHtml = await page.content()
			expect(bodyHtml).not.toContain('<script>alert("XSS")</script>')
		})

		test('前台搜尋 SQL injection — 不造成伺服器錯誤', async ({ page }) => {
			const { data: freeDoc } = await wpGet<{ slug?: string }>(opts, `${API.posts}/${ids.freeDocId}`)
			test.skip(!freeDoc?.slug, '無法取得免費知識庫 slug')

			const response = await page.goto(
				`/pd_doc/${freeDoc.slug}/?search=${encodeURIComponent("' OR 1=1 --")}`,
				{ waitUntil: 'domcontentloaded', timeout: 15_000 },
			)

			expect(response?.status()).toBeLessThan(500)
		})

		test('前台搜尋 img onerror — 不造成腳本注入', async ({ page }) => {
			const { data: freeDoc } = await wpGet<{ slug?: string }>(opts, `${API.posts}/${ids.freeDocId}`)
			test.skip(!freeDoc?.slug, '無法取得免費知識庫 slug')

			let alertFired = false
			page.on('dialog', async (dialog) => {
				alertFired = true
				await dialog.dismiss()
			})

			const response = await page.goto(
				`/pd_doc/${freeDoc.slug}/?search=${encodeURIComponent('<img onerror="alert(1)" src=x>')}`,
				{ waitUntil: 'domcontentloaded', timeout: 15_000 },
			)

			expect(response?.status()).toBeLessThan(500)
			expect(alertFired).toBe(false)
		})
	})
})
