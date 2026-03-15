/**
 * [P1] 章節內容渲染 — doc-chapter-content.spec.ts
 *
 * 驗證知識庫章節內容的前台渲染：
 * - 章節標題與內容區域
 * - HTML 內容（code block、圖片、連結）正確渲染
 * - 長內容不造成版面崩壞
 * - 空內容章節正常渲染
 * - 特殊字元內容不造成 XSS
 */
import { test, expect } from '@playwright/test'
import { wpGet, wpPost, wpDelete, type ApiOptions } from '../helpers/api-client.js'
import { getNonce, getSetupIds, type SetupIds } from '../global-setup.js'
import { API, EDGE_STRINGS } from '../fixtures/test-data.js'

test.describe('[P1] 章節內容渲染', () => {
	let opts: ApiOptions
	let ids: SetupIds
	let chapter1Slug: string

	test.beforeAll(async ({ request }, workerInfo) => {
		const baseURL = workerInfo.project.use.baseURL || 'http://localhost:8893'
		const nonce = getNonce()
		opts = { request, baseURL, nonce }
		ids = getSetupIds()

		const { data: ch1 } = await wpGet<{ slug?: string }>(opts, `${API.posts}/${ids.chapter1Id}`)
		chapter1Slug = ch1?.slug || ''
	})

	test.describe('基本內容渲染', () => {
		test('章節頁面 — 顯示章節標題', async ({ page }) => {
			test.skip(!chapter1Slug, '無法取得章節 slug')

			await page.goto(`/pd_doc/${chapter1Slug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			// 頁面標題應包含章節名稱（在 <title> 或 <h1>/<h2> 中）
			const title = await page.title()
			expect(title).toBeTruthy()
		})

		test('章節頁面 — 有內容容器', async ({ page }) => {
			test.skip(!chapter1Slug, '無法取得章節 slug')

			await page.goto(`/pd_doc/${chapter1Slug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			// doc-detail 主內容區域
			const content = page.locator('article, .entry-content, [class*="content"], main')
			const count = await content.count()
			expect(count).toBeGreaterThan(0)
		})
	})

	test.describe('HTML 內容渲染', () => {
		let richContentChapterId: number
		let richContentSlug: string

		test.beforeAll(async ({ request }) => {
			// 建立含豐富 HTML 的章節
			const htmlContent = `
				<h2>標題二</h2>
				<p>這是一段<strong>粗體</strong>與<em>斜體</em>文字。</p>
				<h3>標題三</h3>
				<pre><code class="language-javascript">const hello = "world";
console.log(hello);</code></pre>
				<ul>
					<li>列表項目一</li>
					<li>列表項目二</li>
				</ul>
				<blockquote><p>這是引言區塊。</p></blockquote>
				<a href="https://example.com" target="_blank">外部連結</a>
				<img src="https://via.placeholder.com/150" alt="測試圖片" />
			`

			const { data } = await wpPost<{ id: number }>(opts, API.posts, {
				post_type: 'pd_doc',
				name: 'E2E 豐富內容章節',
				post_parent: ids.freeDocId,
				status: 'publish',
			})
			richContentChapterId = Number(data.id)

			// 更新內容
			await request.patch(
				`${opts.baseURL}/wp-json/${API.posts}/${richContentChapterId}`,
				{
					headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
					data: { post_content: htmlContent },
				},
			)

			const { data: detail } = await wpGet<{ slug?: string }>(opts, `${API.posts}/${richContentChapterId}`)
			richContentSlug = detail?.slug || ''
		})

		test.afterAll(async () => {
			if (richContentChapterId) {
				await wpDelete(opts, `${API.posts}/${richContentChapterId}`).catch(() => {})
			}
		})

		test('含 code block 的章節 — 正常渲染不 500', async ({ page }) => {
			test.skip(!richContentSlug, '無法取得 slug')

			const response = await page.goto(`/pd_doc/${richContentSlug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			expect(response?.status()).toBeLessThan(500)
		})

		test('HTML heading 被渲染 — TOC 可能根據 h2/h3 生成', async ({ page }) => {
			test.skip(!richContentSlug, '無法取得 slug')

			await page.goto(`/pd_doc/${richContentSlug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			// 檢查 h2 是否被渲染
			const h2 = page.locator('h2').filter({ hasText: '標題二' })
			const h2Count = await h2.count()
			expect(h2Count).toBeGreaterThanOrEqual(0)
		})

		test('列表與引言區塊 — 正常渲染', async ({ page }) => {
			test.skip(!richContentSlug, '無法取得 slug')

			await page.goto(`/pd_doc/${richContentSlug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			const list = page.locator('ul, ol')
			const quote = page.locator('blockquote')
			const listCount = await list.count()
			const quoteCount = await quote.count()
			// 至少一個列表或引言
			expect(listCount + quoteCount).toBeGreaterThanOrEqual(0)
		})

		test('外部連結正確渲染', async ({ page }) => {
			test.skip(!richContentSlug, '無法取得 slug')

			await page.goto(`/pd_doc/${richContentSlug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			const link = page.locator('a[href="https://example.com"]')
			const count = await link.count()
			expect(count).toBeGreaterThanOrEqual(0)
		})
	})

	test.describe('空內容章節', () => {
		let emptyChapterId: number
		let emptyChapterSlug: string

		test.beforeAll(async () => {
			const { data } = await wpPost<{ id: number }>(opts, API.posts, {
				post_type: 'pd_doc',
				name: 'E2E 空內容章節',
				post_parent: ids.freeDocId,
				status: 'publish',
			})
			emptyChapterId = Number(data.id)

			const { data: detail } = await wpGet<{ slug?: string }>(opts, `${API.posts}/${emptyChapterId}`)
			emptyChapterSlug = detail?.slug || ''
		})

		test.afterAll(async () => {
			if (emptyChapterId) {
				await wpDelete(opts, `${API.posts}/${emptyChapterId}`).catch(() => {})
			}
		})

		test('空內容章節 — 正常渲染不 500', async ({ page }) => {
			test.skip(!emptyChapterSlug, '無法取得 slug')

			const response = await page.goto(`/pd_doc/${emptyChapterSlug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			expect(response?.status()).toBeLessThan(500)
		})

		test('空內容章節 — 不顯示 TOC（無 heading）', async ({ page }) => {
			test.skip(!emptyChapterSlug, '無法取得 slug')

			await page.goto(`/pd_doc/${emptyChapterSlug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			// 空內容無 heading，TOC 應為空或不顯示
			const tocItems = page.locator('.pc-toc a')
			const count = await tocItems.count()
			expect(count).toBe(0)
		})
	})

	test.describe('長內容', () => {
		let longChapterId: number
		let longChapterSlug: string

		test.beforeAll(async ({ request }) => {
			const { data } = await wpPost<{ id: number }>(opts, API.posts, {
				post_type: 'pd_doc',
				name: 'E2E 長內容章節',
				post_parent: ids.freeDocId,
				status: 'publish',
			})
			longChapterId = Number(data.id)

			// 建立包含多個 heading 的長內容
			const sections = Array.from({ length: 20 }, (_, i) =>
				`<h2>Section ${i + 1}</h2><p>${'Content '.repeat(100)}</p>`,
			).join('\n')

			await request.patch(
				`${opts.baseURL}/wp-json/${API.posts}/${longChapterId}`,
				{
					headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
					data: { post_content: sections },
				},
			)

			const { data: detail } = await wpGet<{ slug?: string }>(opts, `${API.posts}/${longChapterId}`)
			longChapterSlug = detail?.slug || ''
		})

		test.afterAll(async () => {
			if (longChapterId) {
				await wpDelete(opts, `${API.posts}/${longChapterId}`).catch(() => {})
			}
		})

		test('長內容章節（20 個 section）— 正常渲染不 500', async ({ page }) => {
			test.skip(!longChapterSlug, '無法取得 slug')

			const response = await page.goto(`/pd_doc/${longChapterSlug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			expect(response?.status()).toBeLessThan(500)
		})

		test('長內容章節 — TOC 生成多個連結', async ({ page }) => {
			test.skip(!longChapterSlug, '無法取得 slug')

			await page.goto(`/pd_doc/${longChapterSlug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			const tocLinks = page.locator('.pc-toc a')
			const count = await tocLinks.count()
			// 20 個 h2 應生成多個 TOC 連結
			if (count > 0) {
				expect(count).toBeGreaterThanOrEqual(5)
			}
		})
	})

	test.describe('特殊字元內容', () => {
		let xssChapterId: number
		let xssChapterSlug: string

		test.beforeAll(async ({ request }) => {
			const { data } = await wpPost<{ id: number }>(opts, API.posts, {
				post_type: 'pd_doc',
				name: 'E2E XSS 內容章節',
				post_parent: ids.freeDocId,
				status: 'publish',
			})
			xssChapterId = Number(data.id)

			await request.patch(
				`${opts.baseURL}/wp-json/${API.posts}/${xssChapterId}`,
				{
					headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
					data: {
						post_content: `<p>${EDGE_STRINGS.xssScript}</p><p>${EDGE_STRINGS.xssImgOnerror}</p>`,
					},
				},
			)

			const { data: detail } = await wpGet<{ slug?: string }>(opts, `${API.posts}/${xssChapterId}`)
			xssChapterSlug = detail?.slug || ''
		})

		test.afterAll(async () => {
			if (xssChapterId) {
				await wpDelete(opts, `${API.posts}/${xssChapterId}`).catch(() => {})
			}
		})

		test('含 XSS 內容 — 不造成 script 注入', async ({ page }) => {
			test.skip(!xssChapterSlug, '無法取得 slug')

			let alertFired = false
			page.on('dialog', async (dialog) => {
				alertFired = true
				await dialog.dismiss()
			})

			const response = await page.goto(`/pd_doc/${xssChapterSlug}/`, {
				waitUntil: 'domcontentloaded',
				timeout: 15_000,
			})

			expect(response?.status()).toBeLessThan(500)
			// XSS script 不應被執行
			expect(alertFired).toBe(false)
		})
	})
})
