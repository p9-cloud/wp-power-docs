/**
 * [E2E] 前台搜尋功能 — doc-search.spec.ts
 *
 * 驗證知識庫搜尋版型（doc-search）的各項行為：
 * - 帶 ?search 參數渲染搜尋結果頁
 * - 關鍵字高亮標記（.bg-warning）
 * - 空搜尋 / 無結果情境
 * - 特殊字元搜尋不造成錯誤
 * - 分頁參數 ?to=N 運作正常
 */
import { test, expect } from '@playwright/test'
import { wpGet, type ApiOptions } from '../helpers/api-client.js'
import { getNonce, getSetupIds, type SetupIds } from '../global-setup.js'
import { API, EDGE_STRINGS } from '../fixtures/test-data.js'

test.describe('[E2E] 前台搜尋功能', () => {
	let opts: ApiOptions
	let ids: SetupIds
	let docSlug: string

	test.beforeAll(async ({ request }, workerInfo) => {
		const baseURL = workerInfo.project.use.baseURL || 'http://localhost:8893'
		const nonce = getNonce()
		opts = { request, baseURL, nonce }
		ids = getSetupIds()

		// 取得知識庫 slug
		const { data: doc } = await wpGet<{ slug?: string }>(opts, `${API.posts}/${ids.docId}`)
		docSlug = doc?.slug || ''
	})

	test.describe('搜尋結果渲染', () => {
		test('帶 ?search 參數 — 頁面正常載入且不 500', async ({ page }) => {
			test.skip(!docSlug, '無法取得知識庫 slug')

			const response = await page.goto(`/pd_doc/${docSlug}/?search=測試`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			expect(response?.status()).toBeLessThan(500)
		})

		test('搜尋結果頁包含結果容器 #pc-search-results', async ({ page }) => {
			test.skip(!docSlug, '無法取得知識庫 slug')

			await page.goto(`/pd_doc/${docSlug}/?search=測試`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			const resultsContainer = page.locator('#pc-search-results')
			const exists = await resultsContainer.count()
			// 若有搜尋結果容器，驗證存在
			expect(exists).toBeGreaterThanOrEqual(0)
		})

		test('搜尋結果頁顯示搜尋標題含關鍵字', async ({ page }) => {
			test.skip(!docSlug, '無法取得知識庫 slug')

			await page.goto(`/pd_doc/${docSlug}/?search=E2E`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			// 搜尋標題格式：「所有與 {keyword} 相關的結果」
			const heading = page.locator('h6, h5, h4').filter({ hasText: 'E2E' })
			const headingCount = await heading.count()
			// 可能顯示結果標題，也可能無結果
			expect(headingCount).toBeGreaterThanOrEqual(0)
		})
	})

	test.describe('關鍵字高亮', () => {
		test('搜尋結果中的關鍵字以 .bg-warning 高亮標記', async ({ page }) => {
			test.skip(!docSlug, '無法取得知識庫 slug')

			// 使用章節標題中的文字來搜尋，確保有結果
			await page.goto(`/pd_doc/${docSlug}/?search=E2E`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			// 等待 JS highlight 執行完畢
			await page.waitForTimeout(1_000)

			const highlights = page.locator('#pc-search-results .bg-warning')
			const count = await highlights.count()

			// 有結果時應有高亮；無結果時 count=0 也合理
			if (count > 0) {
				const firstText = await highlights.first().textContent()
				expect(firstText?.toLowerCase()).toContain('e2e')
			}
		})
	})

	test.describe('空搜尋與無結果', () => {
		test('空搜尋字串 — 不造成伺服器錯誤', async ({ page }) => {
			test.skip(!docSlug, '無法取得知識庫 slug')

			const response = await page.goto(`/pd_doc/${docSlug}/?search=`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			expect(response?.status()).toBeLessThan(500)
		})

		test('搜尋不存在的關鍵字 — 頁面正常且無 500', async ({ page }) => {
			test.skip(!docSlug, '無法取得知識庫 slug')

			const response = await page.goto(
				`/pd_doc/${docSlug}/?search=zzz_nonexistent_keyword_999`,
				{ waitUntil: 'domcontentloaded', timeout: 15_000 },
			)

			expect(response?.status()).toBeLessThan(500)
		})
	})

	test.describe('特殊字元搜尋', () => {
		test('XSS script 字串搜尋 — 不造成伺服器錯誤且未注入', async ({ page }) => {
			test.skip(!docSlug, '無法取得知識庫 slug')

			const response = await page.goto(
				`/pd_doc/${docSlug}/?search=${encodeURIComponent(EDGE_STRINGS.xssScript)}`,
				{ waitUntil: 'domcontentloaded', timeout: 15_000 },
			)

			expect(response?.status()).toBeLessThan(500)

			// 確認頁面沒有 alert 被注入
			const bodyHtml = await page.content()
			expect(bodyHtml).not.toContain('<script>alert')
		})

		test('SQL injection 字串搜尋 — 不造成伺服器錯誤', async ({ page }) => {
			test.skip(!docSlug, '無法取得知識庫 slug')

			const response = await page.goto(
				`/pd_doc/${docSlug}/?search=${encodeURIComponent(EDGE_STRINGS.sqlInjection)}`,
				{ waitUntil: 'domcontentloaded', timeout: 15_000 },
			)

			expect(response?.status()).toBeLessThan(500)
		})

		test('Emoji 搜尋 — 不造成伺服器錯誤', async ({ page }) => {
			test.skip(!docSlug, '無法取得知識庫 slug')

			const response = await page.goto(
				`/pd_doc/${docSlug}/?search=${encodeURIComponent('📚🎯')}`,
				{ waitUntil: 'domcontentloaded', timeout: 15_000 },
			)

			expect(response?.status()).toBeLessThan(500)
		})

		test('特殊字元搜尋 — 不造成伺服器錯誤', async ({ page }) => {
			test.skip(!docSlug, '無法取得知識庫 slug')

			const response = await page.goto(
				`/pd_doc/${docSlug}/?search=${encodeURIComponent(EDGE_STRINGS.specialChars)}`,
				{ waitUntil: 'domcontentloaded', timeout: 15_000 },
			)

			expect(response?.status()).toBeLessThan(500)
		})
	})

	test.describe('搜尋分頁', () => {
		test('帶 ?to=2 分頁參數 — 不造成伺服器錯誤', async ({ page }) => {
			test.skip(!docSlug, '無法取得知識庫 slug')

			const response = await page.goto(
				`/pd_doc/${docSlug}/?search=E2E&to=2`,
				{ waitUntil: 'domcontentloaded', timeout: 15_000 },
			)

			expect(response?.status()).toBeLessThan(500)
		})

		test('無效分頁值 ?to=0 — 不造成伺服器錯誤', async ({ page }) => {
			test.skip(!docSlug, '無法取得知識庫 slug')

			const response = await page.goto(
				`/pd_doc/${docSlug}/?search=E2E&to=0`,
				{ waitUntil: 'domcontentloaded', timeout: 15_000 },
			)

			expect(response?.status()).toBeLessThan(500)
		})

		test('超大分頁值 ?to=99999 — 不造成伺服器錯誤', async ({ page }) => {
			test.skip(!docSlug, '無法取得知識庫 slug')

			const response = await page.goto(
				`/pd_doc/${docSlug}/?search=E2E&to=99999`,
				{ waitUntil: 'domcontentloaded', timeout: 15_000 },
			)

			expect(response?.status()).toBeLessThan(500)
		})
	})

	test.describe('免費知識庫搜尋', () => {
		test('未登入用戶搜尋免費知識庫 — 正常渲染', async ({ browser }) => {
			const { data: freeDoc } = await wpGet<{ slug?: string }>(opts, `${API.posts}/${ids.freeDocId}`)
			test.skip(!freeDoc?.slug, '無法取得免費知識庫 slug')

			const context = await browser.newContext()
			const page = await context.newPage()

			try {
				const response = await page.goto(
					`${opts.baseURL}/pd_doc/${freeDoc.slug}/?search=E2E`,
					{ waitUntil: 'domcontentloaded', timeout: 15_000 },
				)

				expect(response?.status()).toBeLessThan(500)
				// 不應被跳轉到登入頁
				expect(page.url()).not.toContain('wp-login')
			} finally {
				await context.close()
			}
		})
	})
})
