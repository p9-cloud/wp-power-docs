/**
 * Playwright Global Setup — Power Docs E2E
 *
 * 測試開始前執行：
 * 1. 套用 LC bypass
 * 2. 登入 WordPress Admin、儲存認證狀態
 * 3. 刷新永久連結（flush rewrite rules）
 * 4. 停用 WooCommerce Coming Soon 模式
 * 5. 清除舊 E2E 測試資料（前綴 E2E 的 pd_doc）
 * 6. 建立共用測試資料：知識庫、章節、商品、用戶
 * 7. 儲存建立的 ID 供後續測試使用
 */
import { chromium, type FullConfig } from '@playwright/test'
import { applyLcBypass } from './helpers/lc-bypass.js'
import { extractNonce, wpGet, wpPost, wpDelete, wpPostForm, wpPatch, type ApiOptions } from './helpers/api-client.js'
import {
	WP_ADMIN,
	API,
	TEST_DOC,
	TEST_FREE_DOC,
	TEST_CHAPTERS,
	TEST_SUBSCRIBER,
	TEST_SUBSCRIBER_NO_ACCESS,
	TEST_PRODUCT,
} from './fixtures/test-data.js'
import path from 'path'
import fs from 'fs'

const AUTH_DIR = path.resolve(import.meta.dirname, '.auth')
const STORAGE_STATE_PATH = path.join(AUTH_DIR, 'admin.json')
const NONCE_FILE = path.join(AUTH_DIR, 'nonce.txt')
const SETUP_IDS_FILE = path.join(AUTH_DIR, 'setup-ids.json')

export interface SetupIds {
	docId: number
	freeDocId: number
	chapter1Id: number
	chapter2Id: number
	subChapter1Id: number
	productId: number
	subscriberId: number
	noAccessUserId: number
}

/** 讀取 setup 階段建立的 ID */
export function getSetupIds(): SetupIds {
	return JSON.parse(fs.readFileSync(SETUP_IDS_FILE, 'utf-8')) as SetupIds
}

/** 讀取 nonce */
export function getNonce(): string {
	return fs.readFileSync(NONCE_FILE, 'utf-8').trim()
}

/** 冪等建立 WordPress 用戶，已存在則回傳現有 ID */
async function ensureUser(
	opts: ApiOptions,
	userData: {
		username: string
		password: string
		email: string
		firstName: string
		lastName: string
	},
): Promise<number> {
	// 先搜尋是否已存在
	try {
		const searchRes = await opts.request.get(
			`${opts.baseURL}/wp-json/${API.wpUsers}?search=${encodeURIComponent(userData.email)}`,
			{ headers: { 'X-WP-Nonce': opts.nonce } },
		)
		if (searchRes.ok()) {
			const users = await searchRes.json() as { id: number; user_email?: string; slug?: string }[]
			const found = users.find((u) => u.slug === userData.username || u.user_email === userData.email)
			if (found) return Number(found.id)
		}
	} catch { /* ignore */ }

	// 建立新用戶
	const createRes = await opts.request.post(
		`${opts.baseURL}/wp-json/${API.wpUsers}`,
		{
			headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
			data: {
				username: userData.username,
				password: userData.password,
				email: userData.email,
				first_name: userData.firstName,
				last_name: userData.lastName,
				roles: ['subscriber'],
			},
		},
	)
	if (createRes.ok()) {
		const user = await createRes.json() as { id: number }
		return Number(user.id)
	}
	return 0
}

async function globalSetup(config: FullConfig): Promise<void> {
	const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:8893'

	// 1. 套用 LC bypass
	console.log('[Global Setup] Applying LC bypass...')
	applyLcBypass()

	// 2. 確保 .auth 目錄存在
	if (!fs.existsSync(AUTH_DIR)) {
		fs.mkdirSync(AUTH_DIR, { recursive: true })
	}

	// 3. 登入 WordPress Admin
	console.log('[Global Setup] Logging in to WordPress Admin...')
	const browser = await chromium.launch()
	const context = await browser.newContext()
	const page = await context.newPage()

	try {
		await page.goto(`${baseURL}/wp-login.php`, {
			waitUntil: 'domcontentloaded',
			timeout: 30_000,
		})

		await page.fill('#user_login', WP_ADMIN.username)
		await page.fill('#user_pass', WP_ADMIN.password)
		await page.click('#wp-submit')
		await page.waitForURL(/wp-admin/, { timeout: 30_000 })

		console.log('[Global Setup] Login successful, saving storage state...')
		await context.storageState({ path: STORAGE_STATE_PATH })

		// 3.5 刷新永久連結
		console.log('[Global Setup] Flushing rewrite rules...')
		try {
			await page.goto(`${baseURL}/wp-admin/options-permalink.php`, {
				waitUntil: 'domcontentloaded',
				timeout: 30_000,
			})
			await page.click('#submit')
			await page.waitForURL(/options-permalink/, { timeout: 30_000 })
			console.log('[Global Setup] Rewrite rules flushed.')
		} catch (e) {
			console.warn('[Global Setup] Flush rewrite rules warning:', e)
		}

		// 4. 取得 nonce
		const nonce = await extractNonce(page, baseURL)
		fs.writeFileSync(NONCE_FILE, nonce)
		console.log('[Global Setup] Nonce saved.')

		const opts: ApiOptions = { request: context.request, baseURL, nonce }

		// 4.1 停用 WooCommerce Coming Soon
		console.log('[Global Setup] Disabling WooCommerce Coming Soon mode...')
		try {
			await context.request.post(`${baseURL}/wp-json/wp/v2/settings`, {
				headers: { 'X-WP-Nonce': nonce },
				data: { woocommerce_coming_soon: 'no' },
			})
		} catch (e) {
			console.warn('[Global Setup] Coming Soon disable (non-fatal):', e)
		}

		// 5. 清除舊 E2E 測試資料
		console.log('[Global Setup] Cleaning old E2E test data...')
		try {
			const { data: oldDocs } = await wpGet<{ id: number; name: string }[]>(
				opts,
				API.posts,
				{ post_type: 'pd_doc', posts_per_page: '100' },
			)
			if (Array.isArray(oldDocs)) {
				// 篩選 E2E 前綴的知識庫
				const e2eDocs = oldDocs.filter(
					(d) => typeof d.name === 'string' && d.name.startsWith('E2E'),
				)
				for (const doc of e2eDocs) {
					try {
						// 先刪子章節
						const { data: children } = await wpGet<{ id: number }[]>(
							opts,
							API.posts,
							{ post_type: 'pd_doc', post_parent: String(doc.id), posts_per_page: '100' },
						)
						if (Array.isArray(children)) {
							for (const child of children) {
								// 刪孫節點
								const { data: grandChildren } = await wpGet<{ id: number }[]>(
									opts,
									API.posts,
									{ post_type: 'pd_doc', post_parent: String(child.id), posts_per_page: '100' },
								)
								if (Array.isArray(grandChildren)) {
									for (const gc of grandChildren) {
										await wpDelete(opts, `${API.posts}/${gc.id}`).catch(() => {})
									}
								}
								await wpDelete(opts, `${API.posts}/${child.id}`).catch(() => {})
							}
						}
						await wpDelete(opts, `${API.posts}/${doc.id}`).catch(() => {})
					} catch { /* ignore */ }
				}
			}
		} catch (e) {
			console.warn('[Global Setup] Doc cleanup warning (non-fatal):', e)
		}

		// 6. 建立測試資料
		console.log('[Global Setup] Creating test data...')
		const ids: Partial<SetupIds> = {}

		// 6.1 建立需授權知識庫
		const { data: docData } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: TEST_DOC.name,
			status: 'publish',
		})
		ids.docId = Number(docData.id)
		console.log(`[Global Setup] Created doc #${ids.docId}`)

		// 設定 need_access=yes
		await context.request.patch(
			`${baseURL}/wp-json/${API.posts}/${ids.docId}`,
			{
				headers: { 'X-WP-Nonce': nonce, 'Content-Type': 'application/json' },
				data: { need_access: 'yes', unauthorized_redirect_url: TEST_DOC.unauthorizedRedirectUrl },
			},
		).catch((e) => console.warn('[Global Setup] set need_access warning:', e))

		// 6.2 建立免費知識庫
		const { data: freeDocData } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: TEST_FREE_DOC.name,
			status: 'publish',
		})
		ids.freeDocId = Number(freeDocData.id)
		console.log(`[Global Setup] Created free doc #${ids.freeDocId}`)

		await context.request.patch(
			`${baseURL}/wp-json/${API.posts}/${ids.freeDocId}`,
			{
				headers: { 'X-WP-Nonce': nonce, 'Content-Type': 'application/json' },
				data: { need_access: 'no' },
			},
		).catch(() => {})

		// 6.3 建立章節（depth=1）
		const { data: ch1 } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: TEST_CHAPTERS.chapter1.title,
			post_parent: ids.docId,
			status: 'publish',
		})
		ids.chapter1Id = Number(ch1.id)

		const { data: ch2 } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: TEST_CHAPTERS.chapter2.title,
			post_parent: ids.docId,
			status: 'publish',
		})
		ids.chapter2Id = Number(ch2.id)

		// 6.4 建立孫章節（depth=2）
		const { data: sub1 } = await wpPost<{ id: number }>(opts, API.posts, {
			post_type: 'pd_doc',
			name: TEST_CHAPTERS.subChapter1.title,
			post_parent: ids.chapter1Id,
			status: 'publish',
		})
		ids.subChapter1Id = Number(sub1.id)
		console.log(`[Global Setup] Created chapters: ${ids.chapter1Id}, ${ids.chapter2Id}, sub: ${ids.subChapter1Id}`)

		// 6.5 建立 WooCommerce 測試商品
		try {
			const prodResp = await context.request.post(
				`${baseURL}/wp-json/${API.wcProducts}`,
				{
					headers: { 'X-WP-Nonce': nonce, 'Content-Type': 'application/json' },
					data: {
						name: TEST_PRODUCT.name,
						type: TEST_PRODUCT.type,
						regular_price: TEST_PRODUCT.regularPrice,
						status: 'publish',
					},
				},
			)
			const prodData = await prodResp.json() as { id: number }
			ids.productId = Number(prodData.id)
			console.log(`[Global Setup] Created product #${ids.productId}`)
		} catch (e) {
			console.warn('[Global Setup] Product creation warning (non-fatal):', e)
			ids.productId = 0
		}

		// 6.6 建立測試用戶
		for (const userData of [
			{ ...TEST_SUBSCRIBER, key: 'subscriberId' as const },
			{ ...TEST_SUBSCRIBER_NO_ACCESS, key: 'noAccessUserId' as const },
		]) {
			ids[userData.key] = await ensureUser(opts, userData)
			console.log(`[Global Setup] User ${userData.username} #${ids[userData.key]}`)
		}

		// 7. 儲存 IDs
		fs.writeFileSync(SETUP_IDS_FILE, JSON.stringify(ids, null, 2))
		console.log('[Global Setup] Setup IDs saved:', ids)
	} catch (error) {
		console.error('[Global Setup] Failed:', error)
		throw error
	} finally {
		await browser.close()
	}

	console.log('[Global Setup] Complete.')
}

export default globalSetup
