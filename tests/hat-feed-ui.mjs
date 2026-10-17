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
      { ...base, id: 'range', hat_name: 'Range package', hat_title: 'Range editor', price_type: 'range', price_min: 10000, price_max: 20000, rate_unit: 'hour' },
    ]
    let writes = 0
    let failSave = false
    await page.route('**/api/**', async (route) => {
      const req = route.request(), url = new URL(req.url())
      const respond = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
      if (url.pathname === '/api/auth') return respond({ user: { id: 'owner', username: 'studio', full_name: 'Studio', role: 'dual' }, notifications: [] })
      if (url.pathname === '/api/hats') {
        if (url.searchParams.get('feed') === '1') {
          assert.equal(url.searchParams.has('role'), false, 'Bento Feed must request both roles')
        }
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
    // Same account, different Hat roles: both must have their own card.
    hats.push({ ...base, id: 'talent-preview', role: 'talent', feed_visible: true,
      hat_name: 'Photography package', hat_title: 'Portrait photographer' })
    await page.goto('http://127.0.0.1:5181/bento')
    await page.getByText('Range package', { exact: true }).waitFor()
    await page.getByText('Photography package', { exact: true }).waitFor()
    assert.equal(await page.getByText('Fixed package', { exact: true }).count(), 0)
    assert.equal(await page.getByText(/\+1 more/).count(), 0, 'hidden Hats must not contribute to the feed group')
    assert.equal(await page.getByRole('button', { name: 'View/Apply' }).count(), 1)
    assert.equal(await page.getByRole('button', { name: 'View/Book' }).count(), 1)
    assert.equal(await page.locator('article').count(), 2, 'dual-role creator needs both client and talent cards')
    assert.equal(await page.getByText('/hour',{exact:false}).count() > 0,true,'range price must display pay unit')
    assert.equal(await page.getByRole('searchbox',{name:'Search BentoField talents and client Hats'}).count(),1)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)

    // One subscriber with simultaneous services needs two distinct decisions,
    // never shuffling Hat price or availability inside a single card.
    hats[0].feed_visible=true
    await page.reload()
    await page.getByText('Fixed package',{exact:true}).waitFor()
    assert.equal(await page.locator('article').count(),3,'independent cards for each visible Hat')
    assert.equal(await page.getByRole('button',{name:'View/Apply'}).count(),2)
    const fixedCard=page.locator('article').filter({hasText:'Fixed package'})
    assert.ok((await fixedCard.innerText()).includes('/day'))
    const rangeCard=page.locator('article').filter({hasText:'Range package'})
    assert.ok((await rangeCard.innerText()).includes('/hour'))
    await page.getByRole('button',{name:'+1 More',exact:true}).first().click()
    await page.getByText('Other independently bookable Hats').first().waitFor()
    const search=page.getByRole('searchbox',{name:'Search BentoField talents and client Hats'})
    const searchBox=await search.boundingBox()
    await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight))
    const scrollBox=await search.boundingBox()
    assert.equal(Math.round(scrollBox.y),Math.round(searchBox.y),
      'BentoField search should remain sticky during card scrolling')
    await page.goto('http://127.0.0.1:5181/my-hats')
    await page.getByText('Fixed package',{exact:true}).waitFor()
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,
      'My Hats Bento cards must fit mobile screens')
    hats[0].feed_visible=false
    hats.pop()
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
  console.log('Hat feed UI passed: mixed client/talent cards per dual-role creator, grid/desktop, list/mobile, feed filtering, and Hat visibility controls.')
} finally { await browser?.close(); await vite.close() }
