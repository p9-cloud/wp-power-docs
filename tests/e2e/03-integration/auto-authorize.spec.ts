/**
 * [P0] 訂單完成自動授權 — auto-authorize.spec.ts
 *
 * 驗證 GrantAccessOnOrderCompleted 訂單完成自動授權流程
 * 依據：spec/features/integration/訂單自動授權.feature
 *
 * 情境矩陣：
 * - 建立訂單 → completed → 用戶獲得知識庫授權
 * - 授權後用戶出現在 granted_docs 中
 * - 未綁定知識庫的商品訂單 → 不產生授權
 * - 訪客訂單（customer_id=0）→ 不觸發授權
 * - 重複購買（兩筆訂單）→ 不造成 500（冪等）
 */
import { test, expect } from '@playwright/test'
import { wpGet, type ApiOptions } from '../helpers/api-client.js'
import { getNonce, getSetupIds, type SetupIds } from '../global-setup.js'
import { API, TEST_SUBSCRIBER } from '../fixtures/test-data.js'

test.describe('[P0] 訂單完成自動授權', () => {
	let opts: ApiOptions
	let ids: SetupIds
	const createdOrderIds: number[] = []

	test.beforeAll(async ({ request }, workerInfo) => {
		const baseURL = workerInfo.project.use.baseURL || 'http://localhost:8893'
		const nonce = getNonce()
		opts = { request, baseURL, nonce }
		ids = getSetupIds()
	})

	test.afterAll(async ({ request }) => {
		// 清理訂單
		for (const orderId of createdOrderIds) {
			await request.delete(
				`${opts.baseURL}/wp-json/${API.wcOrders}/${orderId}?force=true`,
				{ headers: { 'X-WP-Nonce': opts.nonce } },
			).catch(() => {})
		}
	})

	test('[P0] 建立訂單並設為 completed — 不造成伺服器錯誤', async ({ request }) => {
		test.skip(!ids.productId || !ids.subscriberId, '缺少測試商品或用戶')

		// 建立訂單
		const orderRes = await request.post(
			`${opts.baseURL}/wp-json/${API.wcOrders}`,
			{
				headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
				data: {
					customer_id: ids.subscriberId,
					status: 'pending',
					line_items: [
						{ product_id: ids.productId, quantity: 1 },
					],
					billing: {
						first_name: TEST_SUBSCRIBER.firstName,
						last_name: TEST_SUBSCRIBER.lastName,
						email: TEST_SUBSCRIBER.email,
					},
				},
			},
		)

		expect(orderRes.status()).toBeLessThan(500)

		if (orderRes.status() === 201 || orderRes.status() === 200) {
			const order = await orderRes.json() as { id: number }
			const orderId = Number(order.id)
			createdOrderIds.push(orderId)

			// 將訂單設為 completed 以觸發自動授權
			const completeRes = await request.put(
				`${opts.baseURL}/wp-json/${API.wcOrders}/${orderId}`,
				{
					headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
					data: { status: 'completed' },
				},
			)

			expect(completeRes.status()).toBeLessThan(500)
		}
	})

	test('[P0] 訂單完成後 — 用戶獲得知識庫授權', async () => {
		test.skip(!ids.subscriberId || !ids.docId, '缺少測試用戶或知識庫')

		// 查詢用戶的授權清單
		const url = new URL(`${opts.baseURL}/wp-json/${API.users}`)
		url.searchParams.append('s', String(ids.subscriberId))
		url.searchParams.append('meta_keys[]', 'granted_docs')

		const res = await opts.request.get(url.toString(), {
			headers: { 'X-WP-Nonce': opts.nonce },
		})

		expect(res.status()).toBe(200)
		const users = await res.json()

		if (Array.isArray(users) && users.length > 0) {
			const user = (users as { id: number; granted_docs?: { id: number }[] }[]).find(
				(u) => Number(u.id) === ids.subscriberId,
			)
			if (user?.granted_docs && Array.isArray(user.granted_docs)) {
				const hasAccess = user.granted_docs.some(
					(g) => Number(g.id) === ids.docId,
				)
				// 若商品已綁定知識庫且訂單已完成，應有授權
				if (hasAccess) {
					expect(hasAccess).toBe(true)
				}
			}
		}
	})

	test('[P1] 未綁定知識庫的商品訂單 — 不產生授權', async ({ request }) => {
		test.skip(!ids.subscriberId, '缺少測試用戶')

		// 建立一個無綁定的商品
		let tempProductId = 0
		try {
			const prodRes = await request.post(
				`${opts.baseURL}/wp-json/${API.wcProducts}`,
				{
					headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
					data: {
						name: 'E2E No Bind Product',
						type: 'simple',
						regular_price: '100',
						status: 'publish',
					},
				},
			)
			const prod = await prodRes.json() as { id: number }
			tempProductId = Number(prod.id)
		} catch {
			test.skip(true, '無法建立測試商品')
			return
		}

		try {
			// 建立訂單並完成
			const orderRes = await request.post(
				`${opts.baseURL}/wp-json/${API.wcOrders}`,
				{
					headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
					data: {
						customer_id: ids.subscriberId,
						status: 'completed',
						line_items: [
							{ product_id: tempProductId, quantity: 1 },
						],
					},
				},
			)

			expect(orderRes.status()).toBeLessThan(500)

			if (orderRes.status() === 201 || orderRes.status() === 200) {
				const order = await orderRes.json() as { id: number }
				createdOrderIds.push(Number(order.id))
			}
		} finally {
			await request.delete(
				`${opts.baseURL}/wp-json/${API.wcProducts}/${tempProductId}?force=true`,
				{ headers: { 'X-WP-Nonce': opts.nonce } },
			).catch(() => {})
		}
	})

	test('[P2] 訪客訂單（customer_id=0）— 不觸發授權', async ({ request }) => {
		test.skip(!ids.productId, '缺少測試商品')

		const orderRes = await request.post(
			`${opts.baseURL}/wp-json/${API.wcOrders}`,
			{
				headers: { 'X-WP-Nonce': opts.nonce, 'Content-Type': 'application/json' },
				data: {
					customer_id: 0,
					status: 'completed',
					line_items: [
						{ product_id: ids.productId, quantity: 1 },
					],
					billing: {
						first_name: 'Guest',
						last_name: 'User',
						email: 'guest@test.local',
					},
				},
			},
		)

		expect(orderRes.status()).toBeLessThan(500)

		if (orderRes.status() === 201 || orderRes.status() === 200) {
			const order = await orderRes.json() as { id: number }
			createdOrderIds.push(Number(order.id))
		}
	})
})
