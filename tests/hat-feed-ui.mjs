import { chromium } from 'playwright'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'

// UI contract checks use isolated API fixtures; hat-feed-visibility.test.mjs
// exercises the real handlers and PostgreSQL queries separately.
const vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)),
  server: { host: '127.0.0.1', port: 5181, strictPort: true } })
let browser
try {
  await vite.listen()
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined })
  await mkdir('test-results', { recursive: true })
  for (const [width, mode] of [[1280, 'grid'], [390, 'list']]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await context.addInitScript((mode) => localStorage.setItem('chombutar_viewMode', mode), mode)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    const base = { user_id: 'owner', username: 'studio', owner_full_name: 'Studio', role: 'client', category: 'Film',
      hiring_duration: '6 months', availability: true, feed_visible: false, currency: 'NGN', media: [] }
    const hats = [
      { ...base, id: 'fixed', hat_name: 'Fixed package', hat_title: 'Fixed editor', price_type: 'fixed', rate: 10000, rate_unit: 'day' },
      { ...base, id: 'range', hat_name: 'Range package', hat_title: 'Range editor', price_type: 'range', price_min: 10000, price_max: 20000 },
    ]
    let writes = 0
    let failSave = false
    await page.route('**/api/**', async (route) => {
      const req = route.request(), url = new URL(req.url())
      const respond = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
      if (url.pathname === '/api/auth') return respond({ user: { id: 'owner', username: 'studio', full_name: 'Studio', role: 'dual' }, notifications: [] })
      if (url.pathname === '/api/hats') {
        return respond({ hats: url.searchParams.get('feed') === '1' ? hats.filter((h) => h.feed_visible) : hats })
      }
      if (req.method() === 'PATCH') {
        writes++
        if (failSave) return respond({ error: 'Save failed. Please try again.' }, 500)
        const hat = hats.find((h) => url.pathname.endsWith(`/${h.id}`))
        const body = req.postDataJSON()
        assert.equal(body.action, 'set_feed_visibility')
        if (hat.price_type === 'range' && body.feed_visible) assert.equal(body.negotiation_fee_confirmed, true)
        hat.feed_visible = body.feed_visible
        return respond({ hat })
      }
      return respond({})
    })
    const rangeSwitch = () => page.getByRole('switch', { name: 'Show Range package in feed', exact: true })
    const fixedSwitch = () => page.getByRole('switch', { name: 'Show Fixed package in feed', exact: true })
    await page.goto('http://127.0.0.1:5181/my-hats')
    await rangeSwitch().waitFor()
    assert.equal(await rangeSwitch().getAttribute('aria-checked'), 'false')
    await rangeSwitch().click()
    await page.getByRole('alertdialog', { name: 'A negotiation fee applies' }).waitFor()
    assert.equal(writes, 0, 'opening the notice must not publish')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    assert.equal(writes, 0)
    await rangeSwitch().click()
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('alertdialog').count(), 0)
    assert.equal(writes, 0)
    await rangeSwitch().click()
    await page.getByRole('button', { name: 'Confirm and show' }).click()
    await page.getByRole('switch', { name: 'Show Range package in feed', checked: true }).waitFor()
    await page.reload()
    await page.getByRole('switch', { name: 'Show Range package in feed', checked: true }).waitFor()
    await page.screenshot({ path: `test-results/hat-feed-${mode}-${width}.png`, fullPage: true })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.goto('http://127.0.0.1:5181/')
    await page.getByText('Range package', { exact: true }).waitFor()
    assert.equal(await page.getByText('Fixed package', { exact: true }).count(), 0)
    assert.equal(await page.getByText(/\+1 more/).count(), 0, 'hidden Hats must not contribute to the feed group')
    await page.goto('http://127.0.0.1:5181/my-hats')
    await rangeSwitch().click()
    await page.getByRole('switch', { name: 'Show Range package in feed', checked: false }).waitFor()
    failSave = true
    await fixedSwitch().click()
    await page.getByRole('alert').filter({ hasText: 'Save failed' }).waitFor()
    assert.equal(await fixedSwitch().getAttribute('aria-checked'), 'false')
    failSave = false
    await fixedSwitch().click()
    await page.getByRole('switch', { name: 'Show Fixed package in feed', checked: true }).waitFor()
    assert.equal(await page.getByRole('alertdialog').count(), 0, 'Fixed pricing needs no notice')
    await rangeSwitch().click()
    failSave = true
    await page.getByRole('button', { name: 'Confirm and show' }).click()
    await page.getByRole('alertdialog').getByRole('alert').waitFor()
    assert.equal(await rangeSwitch().getAttribute('aria-checked'), 'false')
    await page.screenshot({ path: `test-results/hat-feed-notice-${width}.png` })
    failSave = false
    await page.getByRole('button', { name: 'Confirm and show' }).click()
    await page.getByRole('switch', { name: 'Show Range package in feed', checked: true }).waitFor()
    assert.deepEqual(errors, [])
    await context.close()
  }
  console.log('Hat feed UI passed: grid/desktop, list/mobile, notice/cancel/Escape, persistence, feed filtering, Fixed toggle, failed saves and retry.')
} finally { await browser?.close(); await vite.close() }
