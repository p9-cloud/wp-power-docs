/**
 * REST API Client — 封裝 WordPress / WooCommerce / Powerhouse API 操作
 *
 * Power Docs 使用 Powerhouse 的通用 REST API，端點為：
 *   - POST   /wp-json/v2/powerhouse/posts          建立知識庫/章節
 *   - GET    /wp-json/v2/powerhouse/posts          查詢列表
 *   - GET    /wp-json/v2/powerhouse/posts/{id}     查詢詳情
 *   - PATCH  /wp-json/v2/powerhouse/posts/{id}     更新
 *   - DELETE /wp-json/v2/powerhouse/posts/{id}     刪除
 *   - POST   /wp-json/v2/powerhouse/posts/sort     排序
 *   - POST   /wp-json/v2/powerhouse/copy/{id}      複製
 *   - GET    /wp-json/v2/powerhouse/products       商品列表
 *   - POST   /wp-json/v2/powerhouse/products/bind-items
 *   - POST   /wp-json/v2/powerhouse/products/unbind-items
 *   - POST   /wp-json/v2/powerhouse/products/update-bound-items
 *   - POST   /wp-json/v2/powerhouse/limit/grant-users
 *   - POST   /wp-json/v2/powerhouse/limit/revoke-users
 *   - POST   /wp-json/v2/powerhouse/limit/update-users
 *   - GET    /wp-json/power-docs/v1/users          用戶列表（Power Docs 自訂）
 */
import type { APIRequestContext, Page } from '@playwright/test'

export type ApiOptions = {
	request: APIRequestContext
	baseURL: string
	nonce: string
}

/** 組裝帶有 nonce 的 header */
function jsonHeaders(nonce: string): Record<string, string> {
	return {
		'X-WP-Nonce': nonce,
		'Content-Type': 'application/json',
	}
}

/** 組裝 form-urlencoded header */
function formHeaders(nonce: string): Record<string, string> {
	return {
		'X-WP-Nonce': nonce,
		'Content-Type': 'application/x-www-form-urlencoded',
	}
}

/**
 * 將物件序列化為 application/x-www-form-urlencoded 字串
 * 支援陣列（PHP 需要 key[] 格式）
 */
function toFormData(data: Record<string, unknown>): string {
	const params = new URLSearchParams()
	for (const [key, value] of Object.entries(data)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				params.append(`${key}[]`, String(item))
			}
		} else if (value !== undefined && value !== null) {
			params.append(key, String(value))
		}
	}
	return params.toString()
}

/** GET 請求 */
export async function wpGet<T = unknown>(
	opts: ApiOptions,
	endpoint: string,
	params?: Record<string, string | string[]>,
): Promise<{ data: T; status: number; headers: Record<string, string> }> {
	const url = new URL(`${opts.baseURL}/wp-json/${endpoint}`)
	if (params) {
		Object.entries(params).forEach(([k, v]) => {
			if (Array.isArray(v)) {
				v.forEach((item) => url.searchParams.append(`${k}[]`, item))
			} else {
				url.searchParams.set(k, v)
			}
		})
	}
	const res = await opts.request.get(url.toString(), {
		headers: jsonHeaders(opts.nonce),
	})
	const data = await res.json().catch(() => ({}))
	return {
		data: data as T,
		status: res.status(),
		headers: Object.fromEntries(
			res.headersArray().map((h) => [h.name.toLowerCase(), h.value]),
		),
	}
}

/** POST 請求（JSON body）*/
export async function wpPost<T = unknown>(
	opts: ApiOptions,
	endpoint: string,
	data: Record<string, unknown>,
): Promise<{ data: T; status: number }> {
	const res = await opts.request.post(
		`${opts.baseURL}/wp-json/${endpoint}`,
		{
			headers: jsonHeaders(opts.nonce),
			data,
		},
	)
	const body = await res.json().catch(() => ({}))
	return { data: body as T, status: res.status() }
}

/** POST 請求（form-urlencoded body，Powerhouse API 使用）*/
export async function wpPostForm<T = unknown>(
	opts: ApiOptions,
	endpoint: string,
	data: Record<string, unknown>,
): Promise<{ data: T; status: number }> {
	const res = await opts.request.post(
		`${opts.baseURL}/wp-json/${endpoint}`,
		{
			headers: formHeaders(opts.nonce),
			data: toFormData(data),
		},
	)
	const body = await res.json().catch(() => ({}))
	return { data: body as T, status: res.status() }
}

/** PATCH 請求（JSON body）*/
export async function wpPatch<T = unknown>(
	opts: ApiOptions,
	endpoint: string,
	data: Record<string, unknown>,
): Promise<{ data: T; status: number }> {
	const res = await opts.request.patch(
		`${opts.baseURL}/wp-json/${endpoint}`,
		{
			headers: jsonHeaders(opts.nonce),
			data,
		},
	)
	const body = await res.json().catch(() => ({}))
	return { data: body as T, status: res.status() }
}

/** PATCH 請求（form-urlencoded body）*/
export async function wpPatchForm<T = unknown>(
	opts: ApiOptions,
	endpoint: string,
	data: Record<string, unknown>,
): Promise<{ data: T; status: number }> {
	const res = await opts.request.patch(
		`${opts.baseURL}/wp-json/${endpoint}`,
		{
			headers: formHeaders(opts.nonce),
			data: toFormData(data),
		},
	)
	const body = await res.json().catch(() => ({}))
	return { data: body as T, status: res.status() }
}

/** DELETE 請求 */
export async function wpDelete<T = unknown>(
	opts: ApiOptions,
	endpoint: string,
	params?: Record<string, string>,
): Promise<{ data: T; status: number }> {
	const url = new URL(`${opts.baseURL}/wp-json/${endpoint}`)
	if (params) {
		Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
	}
	const res = await opts.request.delete(url.toString(), {
		headers: jsonHeaders(opts.nonce),
	})
	const body = await res.json().catch(() => ({}))
	return { data: body as T, status: res.status() }
}

/** PUT 請求（JSON body）*/
export async function wpPut<T = unknown>(
	opts: ApiOptions,
	endpoint: string,
	data: Record<string, unknown>,
): Promise<{ data: T; status: number }> {
	const res = await opts.request.put(
		`${opts.baseURL}/wp-json/${endpoint}`,
		{
			headers: jsonHeaders(opts.nonce),
			data,
		},
	)
	const body = await res.json().catch(() => ({}))
	return { data: body as T, status: res.status() }
}

/**
 * 從 wp-admin 頁面的 wpApiSettings 提取 REST nonce
 */
export async function extractNonce(page: Page, baseURL: string): Promise<string> {
	await page.goto(`${baseURL}/wp-admin/`, { waitUntil: 'domcontentloaded' })
	await page.waitForSelector('body.wp-admin', { timeout: 15_000 })
	const nonce = await page.evaluate(
		() => (window as unknown as { wpApiSettings?: { nonce: string } }).wpApiSettings?.nonce ?? '',
	)
	if (!nonce) {
		throw new Error('無法提取 WP REST nonce，請確認管理員已登入')
	}
	return nonce
}

/* ── 便利方法：知識庫 ────────────────────────── */

/** 建立知識庫（根層級）並回傳 ID */
export async function createDoc(
	opts: ApiOptions,
	name: string,
	extra: Record<string, unknown> = {},
): Promise<number> {
	const { data, status } = await wpPost<{ id: number }>(opts, 'v2/powerhouse/posts', {
		post_type: 'pd_doc',
		name,
		...extra,
	})
	if (status !== 200 || !data?.id) {
		throw new Error(`建立知識庫失敗 (${status}): ${JSON.stringify(data)}`)
	}
	return Number(data.id)
}

/** 建立子章節並回傳 ID */
export async function createChapter(
	opts: ApiOptions,
	name: string,
	parentId: number,
	extra: Record<string, unknown> = {},
): Promise<number> {
	const { data, status } = await wpPost<{ id: number }>(opts, 'v2/powerhouse/posts', {
		post_type: 'pd_doc',
		name,
		post_parent: parentId,
		...extra,
	})
	if (status !== 200 || !data?.id) {
		throw new Error(`建立章節失敗 (${status}): ${JSON.stringify(data)}`)
	}
	return Number(data.id)
}

/** 刪除知識庫（靜默失敗）*/
export async function deleteDoc(opts: ApiOptions, id: number): Promise<void> {
	await wpDelete(opts, `v2/powerhouse/posts/${id}`).catch(() => {})
}

/** 批次刪除（由內向外）*/
export async function deleteDocs(opts: ApiOptions, ids: number[]): Promise<void> {
	for (const id of [...ids].reverse()) {
		await deleteDoc(opts, id)
	}
}

/** 授予用戶知識庫權限 */
export async function grantDocAccess(
	opts: ApiOptions,
	userId: number,
	docId: number,
	expireDate: number = 0,
): Promise<void> {
	const { status } = await wpPostForm(opts, 'v2/powerhouse/limit/grant-users', {
		user_ids: [userId],
		item_ids: [docId],
		expire_date: expireDate,
	})
	if (status >= 400) {
		throw new Error(`授予權限失敗 (${status})`)
	}
}

/** 撤銷用戶知識庫權限 */
export async function revokeDocAccess(
	opts: ApiOptions,
	userId: number,
	docId: number,
): Promise<void> {
	await wpPostForm(opts, 'v2/powerhouse/limit/revoke-users', {
		user_ids: [userId],
		item_ids: [docId],
	}).catch(() => {})
}
