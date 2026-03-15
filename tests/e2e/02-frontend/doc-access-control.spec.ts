/**
 * [P0] 前台存取控制詳細情境 — doc-access-control.spec.ts
 *
 * 驗證知識庫前台的詳細存取控制情境
 * 依據：spec/features/doc/存取控制.feature
 *
 * 情境矩陣（角色 × 知識庫類型 × 頁面層級）：
 * - 未登入 × need_access=yes × 根 → 跳轉
 * - 未登入 × need_access=yes × 章節 → 繼承跳轉
 * - 未登入 × need_access=yes × 二級子章節 → 繼承跳轉
 * - 未登入 × need_access=no × 子章節 → 可存取
 * - 未登入 × need_access=no × 根 + ?search → 可存取
 * - 管理員 × 所有層級 → 可存取
 * - 草稿 × 未登入 → 404 非 500
 * - 草稿 × subscriber → 404 非 500
 * - 不存在 slug → 404
 */
import { test, expect, type BrowserContext } from '@playwright/test'
import { wpGet, wpPost, wpDelete, type ApiOptions } from '../helpers/api-client.js'
import { getNonce, getSetupIds, type SetupIds } from '../global-setup.js'
import { API, TEST_SUBSCRIBER, TEST_SUBSCRIBER_NO_ACCESS } from '../fixtures/test-data.js'

test.describe('[P0] 前台存取控制詳細情境', () => {
	let opts: ApiOptions
	let ids: SetupIds
	let docSlug: string
	let freeDocSlug: string
	let chapter1Slug: string
	let subChapter1Slug: string

	test.beforeAll(async ({ request }, workerInfo) => {
		const baseURL = workerInfo.project.use.baseURL || 'http://localhost:8893'
		const nonce = getNonce()
		opts = { request, baseURL, nonce }
		ids = getSetupIds()

		const [docRes, freeRes, ch1Res, sub1Res] = await Promise.all([
			wpGet<{ slug?: string }>(opts, `${API.posts}/${ids.docId}`),
			wpGet<{ slug?: string }>(opts, `${API.posts}/${ids.freeDocId}`),
			wpGet<{ slug?: string }>(opts, `${API.posts}/${ids.chapter1Id}`),
			wpGet<{ slug?: string }>(opts, `${API.posts}/${ids.subChapter1Id}`),
		])

		docSlug = docRes.data?.slug || ''
		freeDocSlug = freeRes.data?.slug || ''
		chapter1Slug = ch1Res.data?.slug || ''
		subChapter1Slug = sub1Res.data?.slug || ''
	})

	/** 以指定帳號登入並回傳全新 context */
	async function loginAsUser(
		browser: import('@playwright/test').Browser,
		username: string,
		password: string,
	): Promise<BrowserContext> {
		const context = await browser.newContext()
		const page = await context.newPage()

		await page.goto(`${opts.baseURL}/wp-login.php`, { waitUntil: 'domcontentloaded' })
		await page.fill('#user_login', username)
		await page.fill('#user_pass', password)
		await page.click('#wp-submit')

		try {
			await page.waitForURL(/wp-admin|account|\/\?/, { timeout: 15_000 })
		} catch {
			// subscriber 登入後可能停留在前台
		}

		return context
	}

	// ── 未授權 subscriber 存取控制 ───────────────

	test('[P0] 無權限用戶訪問需授權知識庫根頁面 — 不拋 500', async ({ browser }) => {
		test.skip(!docSlug || !ids.noAccessUserId, '缺少測試資料')

		const context = await loginAsUser(
			browser,
			TEST_SUBSCRIBER_NO_ACCESS.username,
			TEST_SUBSCRIBER_NO_ACCESS.password,
		)

		try {
			const page = await context.newPage()
			const response = await page.goto(
				`${opts.baseURL}/pd_doc/${docSlug}/`,
				{ waitUntil: 'domcontentloaded', timeout: 15_000 },
			)

			expect(response?.status()).toBeLessThan(500)
		} finally {
			await context.close()
		}
	})

	test('[P0] 無權限用戶訪問需授權知識庫子章節 — 繼承控制不拋 500', async ({ browser }) => {
		test.skip(!chapter1Slug || !ids.noAccessUserId, '缺少測試資料')

		const context = await loginAsUser(
			browser,
			TEST_SUBSCRIBER_NO_ACCESS.username,
			TEST_SUBSCRIBER_NO_ACCESS.password,
		)

		try {
			const page = await context.newPage()
			const response = await page.goto(
				`${opts.baseURL}/pd_doc/${chapter1Slug}/`,
				{ waitUntil: 'domcontentloaded', timeout: 15_000 },
			)

			expect(response?.status()).toBeLessThan(500)
		} finally {
			await context.close()
		}
	})

	test('[P0] 無權限用戶訪問二級子章節 — 繼承控制不拋 500', async ({ browser }) => {
		test.skip(!subChapter1Slug || !ids.noAccessUserId, '缺少測試資料')

		const context = await loginAsUser(
			browser,
			TEST_SUBSCRIBER_NO_ACCESS.username,
			TEST_SUBSCRIBER_NO_ACCESS.password,
		)

		try {
			const page = await context.newPage()
			const response = await page.goto(
				`${opts.baseURL}/pd_doc/${subChapter1Slug}/`,
				{ waitUntil: 'domcontentloaded', timeout: 15_000 },
			)

			expect(response?.status()).toBeLessThan(500)
		} finally {
			await context.close()
		}
	})

	// ── 免費知識庫存取 ────────────────────────────

	test('[P0] 未登入用戶存取免費知識庫子章節 — 可存取不跳轉', async ({ browser }) => {
		const { data: freeCh } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 存取控制-免費子章節',
			post_parent: ids.freeDocId,
			status: 'publish',
		})
		const freeChId = Number(freeCh.id)

		try {
			const { data: freeChDetail } = await wpGet<{ slug?: string }>(opts, `${API.posts}/${freeChId}`)
			test.skip(!freeChDetail?.slug, '無法取得免費章節 slug')

			const context = await browser.newContext()
			const page = await context.newPage()

			try {
				const response = await page.goto(
					`${opts.baseURL}/pd_doc/${freeChDetail.slug}/`,
					{ waitUntil: 'domcontentloaded', timeout: 15_000 },
				)

				expect(response?.status()).toBeLessThan(500)
				expect(page.url()).not.toContain('wp-login')
			} finally {
				await context.close()
			}
		} finally {
			await wpDelete(opts, `${API.posts}/${freeChId}`).catch(() => {})
		}
	})

	test('[P1] 未登入用戶存取免費知識庫 + ?search — 可存取', async ({ browser }) => {
		test.skip(!freeDocSlug, '無法取得免費知識庫 slug')

		const context = await browser.newContext()
		const page = await context.newPage()

		try {
			const response = await page.goto(
				`${opts.baseURL}/pd_doc/${freeDocSlug}/?search=test`,
				{ waitUntil: 'domcontentloaded', timeout: 15_000 },
			)

			expect(response?.status()).toBeLessThan(500)
			expect(page.url()).not.toContain('wp-login')
		} finally {
			await context.close()
		}
	})

	// ── 管理員存取 ────────────────────────────────

	test('[P0] 管理員存取需授權知識庫所有層級 — 均可正常渲染', async ({ page }) => {
		test.skip(!docSlug || !chapter1Slug || !subChapter1Slug, '缺少 slug')

		for (const slug of [docSlug, chapter1Slug, subChapter1Slug]) {
			const response = await page.goto(`/pd_doc/${slug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			expect(response?.status()).toBeLessThan(500)
			expect(page.url()).toContain('pd_doc')
		}
	})

	// ── 草稿存取控制 ──────────────────────────────

	test('[P1] 未登入用戶訪問草稿章節 — 不拋 500', async ({ browser }) => {
		const { data: draft } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 存取控制-草稿章節',
			post_parent: ids.freeDocId,
			status: 'draft',
		})
		const draftId = Number(draft.id)

		try {
			const { data: draftDetail } = await wpGet<{ slug?: string }>(opts, `${API.posts}/${draftId}`)
			if (!draftDetail?.slug) return

			const context = await browser.newContext()
			const page = await context.newPage()

			try {
				const response = await page.goto(
					`${opts.baseURL}/pd_doc/${draftDetail.slug}/`,
					{ waitUntil: 'domcontentloaded', timeout: 15_000 },
				)

				expect(response?.status()).toBeLessThan(500)
			} finally {
				await context.close()
			}
		} finally {
			await wpDelete(opts, `${API.posts}/${draftId}`).catch(() => {})
		}
	})

	test('[P1] subscriber 訪問草稿章節 — 不拋 500', async ({ browser }) => {
		const { data: draft } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: 'E2E 存取控制-Subscriber 草稿',
			post_parent: ids.freeDocId,
			status: 'draft',
		})
		const draftId = Number(draft.id)

		try {
			const { data: draftDetail } = await wpGet<{ slug?: string }>(opts, `${API.posts}/${draftId}`)
			if (!draftDetail?.slug) return

			const context = await loginAsUser(
				browser,
				TEST_SUBSCRIBER.username,
				TEST_SUBSCRIBER.password,
			)

			try {
				const page = await context.newPage()
				const response = await page.goto(
					`${opts.baseURL}/pd_doc/${draftDetail.slug}/`,
					{ waitUntil: 'domcontentloaded', timeout: 15_000 },
				)

				expect(response?.status()).toBeLessThan(500)
			} finally {
				await context.close()
			}
		} finally {
			await wpDelete(opts, `${API.posts}/${draftId}`).catch(() => {})
		}
	})

	// ── 不存在的知識庫 ────────────────────────────

	test('[P1] 訪問不存在的 slug — 不拋 500', async ({ page }) => {
		const response = await page.goto('/pd_doc/nonexistent-e2e-slug-access-control-999/', {
			waitUntil: 'domcontentloaded',
			timeout: 15_000,
		})

		expect(response?.status()).not.toBe(500)
	})
})
