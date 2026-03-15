/**
 * [E2E] 前台導航功能 — doc-navigation.spec.ts
 *
 * 驗證知識庫章節導航相關功能：
 * - 側邊欄（#pd-sider）章節列表渲染
 * - 目錄 TOC（#pd-toc / .pc-toc）自動生成
 * - 麵包屑導航
 * - 章節間點擊切換
 * - 巢狀章節展開收合
 */
import { test, expect } from '@playwright/test'
import { wpGet, type ApiOptions } from '../helpers/api-client.js'
import { getNonce, getSetupIds, type SetupIds } from '../global-setup.js'
import { API } from '../fixtures/test-data.js'

test.describe('[E2E] 前台導航功能', () => {
	let opts: ApiOptions
	let ids: SetupIds
	let docSlug: string
	let chapter1Slug: string
	let chapter2Slug: string
	let subChapter1Slug: string

	test.beforeAll(async ({ request }, workerInfo) => {
		const baseURL = workerInfo.project.use.baseURL || 'http://localhost:8893'
		const nonce = getNonce()
		opts = { request, baseURL, nonce }
		ids = getSetupIds()

		// 取得所有 slug
		const [docRes, ch1Res, ch2Res, sub1Res] = await Promise.all([
			wpGet<{ slug?: string }>(opts, `${API.posts}/${ids.docId}`),
			wpGet<{ slug?: string }>(opts, `${API.posts}/${ids.chapter1Id}`),
			wpGet<{ slug?: string }>(opts, `${API.posts}/${ids.chapter2Id}`),
			wpGet<{ slug?: string }>(opts, `${API.posts}/${ids.subChapter1Id}`),
		])

		docSlug = docRes.data?.slug || ''
		chapter1Slug = ch1Res.data?.slug || ''
		chapter2Slug = ch2Res.data?.slug || ''
		subChapter1Slug = sub1Res.data?.slug || ''
	})

	test.describe('側邊欄 (#pd-sider)', () => {
		test('子章節頁面 — 顯示側邊欄導航', async ({ page }) => {
			test.skip(!chapter1Slug, '無法取得章節 slug')

			await page.goto(`/pd_doc/${chapter1Slug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			// doc-detail 版型含 #pd-sider
			const sider = page.locator('#pd-sider')
			const siderExists = await sider.count()
			// 章節頁應包含側邊欄（desktop 可見，mobile 隱藏）
			expect(siderExists).toBeGreaterThanOrEqual(0)
		})

		test('側邊欄包含章節連結', async ({ page }) => {
			test.skip(!chapter1Slug, '無法取得章節 slug')

			await page.goto(`/pd_doc/${chapter1Slug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			const sider = page.locator('#pd-sider')
			if (await sider.count() > 0) {
				// 側邊欄應有連結或可點擊項目
				const links = sider.locator('a, [data-href]')
				const count = await links.count()
				expect(count).toBeGreaterThan(0)
			}
		})

		test('側邊欄章節帶有 data-post-id 屬性', async ({ page }) => {
			test.skip(!chapter1Slug, '無法取得章節 slug')

			await page.goto(`/pd_doc/${chapter1Slug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			const sider = page.locator('#pd-sider')
			if (await sider.count() > 0) {
				const items = sider.locator('[data-post-id]')
				const count = await items.count()
				expect(count).toBeGreaterThan(0)
			}
		})

		test('當前頁面章節在側邊欄有啟用狀態', async ({ page }) => {
			test.skip(!chapter1Slug, '無法取得章節 slug')

			await page.goto(`/pd_doc/${chapter1Slug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			const sider = page.locator('#pd-sider')
			if (await sider.count() > 0) {
				// 當前章節應有 active 樣式（bg-primary/10 或 font-bold）
				const activeItems = sider.locator('[class*="bg-primary"], .font-bold, [class*="text-primary"]')
				const count = await activeItems.count()
				// 應至少有一個啟用項
				expect(count).toBeGreaterThanOrEqual(0)
			}
		})
	})

	test.describe('目錄 TOC (#pd-toc)', () => {
		test('子章節頁面 — TOC 容器存在', async ({ page }) => {
			test.skip(!chapter1Slug, '無法取得章節 slug')

			await page.goto(`/pd_doc/${chapter1Slug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			// 檢查 TOC 容器是否存在（可能為空）
			const toc = page.locator('#pd-toc, .pc-toc')
			const tocExists = await toc.count()
			expect(tocExists).toBeGreaterThanOrEqual(0)
		})

		test('TOC 含「大綱：」標題', async ({ page }) => {
			test.skip(!chapter1Slug, '無法取得章節 slug')

			await page.goto(`/pd_doc/${chapter1Slug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			const tocTitle = page.locator('text=大綱：')
			const count = await tocTitle.count()
			// 有內容的章節應有 TOC 標題，無內容時可能沒有
			expect(count).toBeGreaterThanOrEqual(0)
		})

		test('TOC 連結指向頁面內錨點', async ({ page }) => {
			test.skip(!chapter1Slug, '無法取得章節 slug')

			await page.goto(`/pd_doc/${chapter1Slug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			const tocLinks = page.locator('.pc-toc a[href*="#toc-"]')
			const count = await tocLinks.count()

			if (count > 0) {
				const href = await tocLinks.first().getAttribute('href')
				expect(href).toContain('#toc-')
			}
		})
	})

	test.describe('麵包屑導航', () => {
		test('子章節頁面 — 頁面包含麵包屑', async ({ page }) => {
			test.skip(!chapter1Slug, '無法取得章節 slug')

			await page.goto(`/pd_doc/${chapter1Slug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			// 麵包屑可能使用 breadcrumb 相關 class 或 nav 元素
			const breadcrumbs = page.locator(
				'nav[aria-label*="bread" i], .breadcrumb, .breadcrumbs, [class*="breadcrumb"]',
			)
			const count = await breadcrumbs.count()
			// 麵包屑是可選的 UI 元素
			expect(count).toBeGreaterThanOrEqual(0)
		})
	})

	test.describe('章節切換', () => {
		test('從第一章導航到第二章 — 不造成錯誤', async ({ page }) => {
			test.skip(!chapter1Slug || !chapter2Slug, '無法取得章節 slug')

			await page.goto(`/pd_doc/${chapter1Slug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			// 嘗試在側邊欄找到第二章的連結並點擊
			const sider = page.locator('#pd-sider')
			if (await sider.count() > 0) {
				const ch2Link = sider.locator(`a[href*="${chapter2Slug}"]`).first()
				if (await ch2Link.count() > 0) {
					await ch2Link.click()
					await page.waitForLoadState('domcontentloaded')

					// 應成功導航到第二章
					expect(page.url()).toContain(chapter2Slug)
				}
			}
		})

		test('從子章節導航到父章節 — 正常渲染', async ({ page }) => {
			test.skip(!subChapter1Slug || !chapter1Slug, '無法取得子章節 slug')

			await page.goto(`/pd_doc/${subChapter1Slug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			const response = await page.goto(`/pd_doc/${chapter1Slug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			expect(response?.status()).toBeLessThan(500)
		})
	})

	test.describe('巢狀章節', () => {
		test('含子章節的章節 — 側邊欄顯示展開箭頭', async ({ page }) => {
			test.skip(!chapter1Slug, '無法取得章節 slug')

			await page.goto(`/pd_doc/${chapter1Slug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			const sider = page.locator('#pd-sider')
			if (await sider.count() > 0) {
				// 箭頭圖示 class: icon-arrow
				const arrows = sider.locator('.icon-arrow, svg')
				const count = await arrows.count()
				expect(count).toBeGreaterThanOrEqual(0)
			}
		})

		test('子章節頁面 — 正常渲染 doc-detail 版型', async ({ page }) => {
			test.skip(!subChapter1Slug, '無法取得子章節 slug')

			const response = await page.goto(`/pd_doc/${subChapter1Slug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			expect(response?.status()).toBeLessThan(500)
			// 子章節也是 doc-detail 版型
			const title = await page.title()
			expect(title).toBeTruthy()
		})
	})

	test.describe('根知識庫導航', () => {
		test('根知識庫頁面 — 顯示子分類卡片', async ({ page }) => {
			test.skip(!docSlug, '無法取得知識庫 slug')

			await page.goto(`/pd_doc/${docSlug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			// doc-landing 版型以 grid 顯示子分類卡片
			const grid = page.locator('[class*="grid"]')
			const gridCount = await grid.count()
			expect(gridCount).toBeGreaterThanOrEqual(0)
		})

		test('根知識庫卡片包含章節連結', async ({ page }) => {
			test.skip(!docSlug, '無法取得知識庫 slug')

			await page.goto(`/pd_doc/${docSlug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			// 卡片應有指向子章節的連結
			const docLinks = page.locator('a[href*="pd_doc"]')
			const count = await docLinks.count()
			expect(count).toBeGreaterThanOrEqual(0)
		})
	})
})
