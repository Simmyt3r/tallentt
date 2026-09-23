import { chromium } from 'playwright'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'

const vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)),
  server: { host: '127.0.0.1', port: 5182, strictPort: true } })
let browser
try {
  await vite.listen()
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined })
  await mkdir('test-results', { recursive: true })
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    const submissions = []
    let failSave = false
    await page.route('**/api/**', async (route) => {
      const req = route.request(), url = new URL(req.url())
      const respond = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
      if (url.pathname === '/api/auth') return respond({ user: { id: 'owner', username: 'studio', full_name: 'Studio', role: 'client' } })
      if (url.pathname === '/api/hats' && req.method() === 'POST') {
        const body = req.postDataJSON()
        submissions.push(body)
        if (failSave) return respond({ error: 'Save failed. Please try again.' }, 500)
        return respond({ hat: { ...body, id: 'created', user_id: 'owner' } }, 201)
      }
      if (url.searchParams.has('categories')) return respond({ categories: [{ name: 'Film' }] })
      return respond({ hats: [], suggestions: [] })
    })
    const toggle = () => page.getByRole('switch', { name: /Show in Bento feeds/ })
    const notice = () => page.getByRole('alertdialog', { name: 'A negotiation fee applies' })
    async function fillForm() {
      await page.locator('#hat-name').fill('Event photos')
      await page.locator('#hat-title').fill('Photographer')
      await page.locator('#hat-category').fill('Film')
      await page.locator('#hat-hiring-duration').selectOption('6 months')
      await page.locator('#hat-amount').fill('10000')
      await page.locator('label').filter({ has: page.locator('input[name="hat-delivery"][value="Remote"]') }).click()
    }
    await page.goto('http://127.0.0.1:5182/create')
    await toggle().waitFor()
    assert.equal(await toggle().getAttribute('aria-checked'), 'false')
    assert.equal(await page.locator('form section').last().getAttribute('id'), 'hat-section-feed')
    // The toggle alone counts as an unsaved change.
    await toggle().click()
    if (width < 768) await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Home', exact: true }).click()
    else await page.getByRole('link', { name: 'ChombuTar home', exact: true }).click()
    await page.getByRole('alertdialog', { name: 'Discard changes?' }).waitFor()
    await page.getByRole('button', { name: 'Stay', exact: true }).click()
    await fillForm()
    assert.equal(await notice().count(), 0)
    await page.locator('label').filter({ has: page.locator('input[name="hat-price-mode"][value="range"]') }).click()
    assert.equal(await toggle().getAttribute('aria-checked'), 'false', 'changing pricing requires a fresh choice')
    await page.locator('#hat-price-min').fill('10000')
    await page.locator('#hat-price-max').fill('20000')
    await toggle().click()
    await notice().waitFor()
    await notice().getByRole('button', { name: 'Cancel', exact: true }).click()
    assert.equal(await toggle().getAttribute('aria-checked'), 'false')
    await toggle().click()
    await page.keyboard.press('Escape')
    assert.equal(await notice().count(), 0)
    assert.equal(await toggle().getAttribute('aria-checked'), 'false')
    await toggle().click()
    await notice().getByRole('button', { name: 'Confirm and show' }).click()
    await toggle().click()
    await toggle().click()
    await notice().waitFor()
    await page.screenshot({ path: `test-results/hat-create-fee-notice-${width}.png` })
    await notice().getByRole('button', { name: 'Confirm and show' }).click()
    assert.equal(submissions.length, 0, 'the toggle never saves or publishes before form submission')
    await page.locator('#hat-section-feed').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `test-results/hat-create-feed-${width}.png` })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    failSave = true
    await page.getByRole('button', { name: 'Publish Hat', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: "Couldn't publish this Hat" }).waitFor()
    assert.equal(await toggle().getAttribute('aria-checked'), 'true')
    assert.equal(await page.locator('#hat-name').inputValue(), 'Event photos')
    failSave = false
    await page.getByRole('button', { name: 'Publish Hat', exact: true }).click()
    await page.waitForURL('**/my-hats')
    assert.equal(submissions.length, 2)
    assert.deepEqual(submissions[0], submissions[1])
    assert.equal(submissions[1].feed_visible, true)
    assert.equal(submissions[1].negotiation_fee_confirmed, true)

    // Default-off and Fixed-on creation submit the intended choice.
    for (const visible of [false, true]) {
      await page.goto('http://127.0.0.1:5182/create')
      await fillForm()
      if (visible) await toggle().click()
      assert.equal(await notice().count(), 0)
      await page.getByRole('button', { name: 'Publish Hat', exact: true }).click()
      await page.waitForURL('**/my-hats')
      assert.equal(submissions.at(-1).feed_visible, visible)
      assert.equal(submissions.at(-1).negotiation_fee_confirmed, false)
    }
    assert.deepEqual(errors, [])
    await context.close()
  }
  console.log('Create Hat feed toggle passed on desktop/mobile: placement, defaults, fee confirmation, cancellation, pricing changes, unsaved changes, save failure/retry and submission.')
} finally { await browser?.close(); await vite.close() }
