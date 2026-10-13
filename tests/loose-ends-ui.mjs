import { chromium } from 'playwright'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const vite = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { host: '127.0.0.1', port: 5186, strictPort: true },
})
let browser
try {
  await vite.listen()
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  })
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    const page = await context.newPage()
    page.setDefaultTimeout(12000)
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    const user = { id: '11111111-1111-4111-8111-111111111111',
      username: 'creator', fullName: 'Creator', role: 'dual' }
    const counts = { incoming: 1, outgoing: 0, active: 0, history: 0 }
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    let firstTalent
    const talentRequested = new Promise((resolve) => { firstTalent = resolve })
    let notificationRefresh = false
    let liveAttempts = 0
    let liveAvailable = false

    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url())
      const respond = (body) => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify(body),
      })
      if (url.pathname === '/api/auth') {
        if (url.searchParams.get('action') === 'notifications') {
          if (url.searchParams.has('before')) {
            return respond({ notifications: [{
              id: '22222222-2222-4222-8222-222222222222',
              title: 'Older notice', body: 'Previous update', type: 'booking_message',
              unread: false, created_at: '2026-10-01T09:00:00Z',
            }], nextCursor: null, unreadCount: 0 })
          }
          return respond({ notifications: [{
            id: notificationRefresh
              ? '44444444-4444-4444-8444-444444444444'
              : '33333333-3333-4333-8333-333333333333',
            title: notificationRefresh ? 'Latest notice' : 'Recent notice',
            body: 'A new booking update', type: 'booking_message',
            unread: false, created_at: '2026-10-13T19:00:00Z',
          }], nextCursor: '33333333-3333-4333-8333-333333333333',
          unreadCount: 0 })
        }
        if (url.searchParams.get('action') === 'notification-count')
          return respond({ unreadCount: 0 })
        return respond({ user })
      }
      if (url.pathname === '/api/live') {
        liveAttempts += 1
        if (!liveAvailable) {
          return route.fulfill({ status: 503, contentType: 'application/json',
            body: JSON.stringify({ error: 'Live service temporarily unavailable.' }) })
        }
        return respond({ rooms: [] })
      }
      if (url.pathname === '/api/escrows') {
        if (url.searchParams.get('deals_count') === '1')
          return respond({ pendingCount: 0 })
        if (url.searchParams.get('deals') === '1') {
          const role = url.searchParams.get('role')
          if (role === 'talent') {
            firstTalent()
            await delay(750)
          }
          return respond({
            items: [{ id: role === 'talent'
              ? '55555555-5555-4555-8555-555555555555'
              : '66666666-6666-4666-8666-666666666666',
              hat_id: '77777777-7777-4777-8777-777777777777',
              hat_title: role === 'talent' ? 'Talent-only job' : 'Client-only job',
              client_full_name: 'Client', talent_full_name: 'Talent',
              amount: 1000, currency: 'NGN', role: role,
              request_state: 'pending', status: 'not_funded',
              created_at: '2026-10-13T10:00:00Z' }],
            counts, nextCursor: null,
          })
        }
      }
      return respond({ rooms: [], items: [], hats: [], conversations: [],
        notifications: [], nextCursor: null, unreadCount: 0 })
    })

    // Switch mode while an older API call is still running.
    await page.goto('http://127.0.0.1:5186/deals?role=talent&tab=incoming')
    await talentRequested
    await page.getByRole('button', { name: 'Client Mode' }).click()
    await page.getByText('Client-only job').waitFor()
    await delay(1050)
    assert.equal(await page.getByText('Talent-only job').count(), 0,
      'late talent response must not overwrite the selected client view')
    assert.equal(await page.getByText('Client-only job').count(), 1)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)

    // Notification polling must not erase previously paginated items.
    await page.goto('http://127.0.0.1:5186/notifications')
    await page.getByText('Recent notice').waitFor()
    await page.getByRole('button', { name: /Load older/ }).click()
    await page.getByText('Older notice').waitFor()
    notificationRefresh = true
    await page.evaluate(() => window.dispatchEvent(new Event('push:notification')))
    await page.getByText('Latest notice').waitFor()
    assert.equal(await page.getByText('Older notice').count(), 1,
      'push updates must not wipe out older loaded notifications')

    // A failed Live API call must show a retryable error, not "Nobody is live".
    await page.goto('http://127.0.0.1:5186/live')
    await page.getByRole('button', { name: 'Retry loading Live' }).waitFor()
    assert.equal(await page.getByText('No Talent is live right now.').count(), 0,
      'failed Live API calls must not look like an empty platform')
    liveAvailable = true
    await page.getByRole('button', { name: 'Retry loading Live' }).click()
    await page.getByText('No Talent is live right now.').waitFor()
    assert.equal(liveAttempts >= 2, true)
    assert.deepEqual(errors, [])
    await context.close()
  }
  console.log('Loose-end browser checks passed: stale My Deals views, notification pagination, Live retry and mobile/desktop overflow.')
} finally {
  await browser?.close()
  await vite.close()
}
