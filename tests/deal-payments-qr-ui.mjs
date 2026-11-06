import { chromium } from 'playwright'
import { preview } from 'vite'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
import QRCode from 'qrcode'
import { closePreview } from './preview-server.mjs'
import { optOutPageToursForFixture } from './page-tour-fixture.mjs'

await mkdir('test-results', { recursive: true })
const vite = await preview({ root: fileURLToPath(new URL('..', import.meta.url)),
  preview: { host: '127.0.0.1', port: 5179, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3000' } } })
const id = '55555555-5555-4555-8555-555555555555'
let browser
const errors = []
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined })
  const clientContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const talentContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })
  await optOutPageToursForFixture(clientContext); await optOutPageToursForFixture(talentContext)
  const client = await clientContext.newPage(), talent = await talentContext.newPage()
  for (const [page, role] of [[client, 'client'], [talent, 'talent']]) {
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`http://127.0.0.1:5179/api/__test/session?role=${role}`)
    await page.goto(`http://127.0.0.1:5179/deals/${id}?role=${role}`)
    await page.getByRole('region', { name: 'QR payment checkpoint', exact: true }).waitFor()
  }
  assert.equal(await talent.getByRole('button', { name: 'Submit work', exact: true }).isDisabled(), true)
  await client.getByRole('button', { name: 'Generate start QR', exact: true }).click()
  await client.getByLabel('Manual code (if the talent cannot scan)').waitFor()
  await client.getByRole('button', { name: 'Send code to talent', exact: true }).click()
  await client.getByText(/Code sent to the talent\./).waitFor()
  await talent.getByRole('button', { name: 'Check for code', exact: true }).click()
  await talent.getByRole('button', { name: 'Confirm start payment', exact: true }).waitFor()
  // Receiving a code must leave the work/payment state unchanged until confirmation.
  assert.equal(await talent.getByRole('button', { name: 'Submit work', exact: true }).isDisabled(), true)
  await talent.getByRole('button', { name: 'Confirm start payment', exact: true }).click()
  const submitWork = talent.getByRole('button', { name: 'Submit work', exact: true })
  await submitWork.waitFor()
  await talent.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent === 'Submit work' && !b.disabled))
  assert.equal(await submitWork.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(10, 19, 230)')
  for (const width of [320, 390, 768, 1440]) {
    await talent.setViewportSize({ width, height: 900 })
    assert.equal(await talent.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `work submission overflow at ${width}`)
  }
  await talent.setViewportSize({ width: 390, height: 844 })
  await submitWork.click()
  const note = 'Completed the agreed video edit. Final delivery: https://example.test/delivery'
  await talent.getByLabel('Work submission details', { exact: true }).fill(note)
  await talent.getByRole('button', { name: 'Confirm submit work', exact: true }).click()
  await talent.getByRole('article', { name: 'Latest work submission', exact: true }).getByText(note).waitFor()
  // The client's open page refreshes and exposes the submission without opening history.
  const submission = client.getByRole('article', { name: 'Latest work submission', exact: true })
  await submission.getByText(note).waitFor({ timeout: 15000 })
  assert.equal(await client.locator('details').filter({ hasText: 'Booking history' }).getAttribute('open'), null)
  await client.getByRole('button', { name: 'Approve delivery', exact: true }).click()
  await client.getByRole('button', { name: 'Confirm approve delivery', exact: true }).click()
  await client.getByRole('button', { name: 'Generate completion QR', exact: true }).click()
  const code = await client.getByLabel('Manual code (if the talent cannot scan)').inputValue()
  await client.getByRole('button', { name: 'Send code to talent', exact: true }).click()
  await talent.getByRole('button', { name: 'Scan completion QR', exact: true }).waitFor({ timeout: 15000 })
  await talent.getByRole('button', { name: 'Check for code', exact: true }).click()
  await talent.getByRole('button', { name: 'Confirm completion payment', exact: true }).waitFor()
  for (const width of [320, 390, 768, 1440]) {
    await talent.setViewportSize({ width, height: 900 })
    assert.equal(await talent.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `QR interface overflow at ${width}`)
  }
  await client.screenshot({ path: 'test-results/deal-qr-client-desktop.png', fullPage: true })
  await talent.setViewportSize({ width: 390, height: 844 })
  await talent.screenshot({ path: 'test-results/deal-qr-talent-mobile.png', fullPage: true })
  // Exercise real ZXing decoding from a saved image, rather than stubbing the reader.
  const image = await QRCode.toBuffer(code, { width: 512, margin: 4 })
  await talent.getByLabel('Payment QR image', { exact: true }).setInputFiles({ name: 'completion-qr.png', mimeType: 'image/png', buffer: image })
  await talent.getByText('Completed', { exact: true }).first().waitFor({ timeout: 15000 })
  const response = await talentContext.request.get('http://127.0.0.1:5179/api/escrows?wallet=1')
  const wallet = (await response.json()).wallet
  assert.equal(wallet.balance, 9500)
  assert.equal(wallet.transactions.filter(t => ['escrow_start', 'escrow_release'].includes(t.type)).length, 2)
  assert.deepEqual(errors, [])
  console.log('Deal QR sharing, received confirmation, image scanning, visible submission and responsive layouts passed.')
} catch (error) {
  for (const [i, page] of (browser?.contexts().flatMap(context => context.pages()) || []).entries()) {
    console.error('Failed page', i, page.url(), (await page.locator('body').innerText()).slice(0,7000), errors)
    await page.screenshot({ path: `test-results/deal-qr-failure-${i}.png`, fullPage: true })
  }
  throw error
} finally {
  await browser?.close(); await new Promise(resolve => vite.httpServer.close(resolve)); await closePreview()
}
