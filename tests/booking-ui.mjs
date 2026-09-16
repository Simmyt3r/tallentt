import { chromium } from 'playwright'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { closePreview } from './preview-server.mjs'

await mkdir('test-results', { recursive: true })
const vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)),
  server: { host: '127.0.0.1', port: 5179, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3000' } } })
let browser
const errors = []
try {
  await vite.listen()
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined })
  const clientContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const talentContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1 })
  const client = await clientContext.newPage()
  const talent = await talentContext.newPage()
  for (const page of [client, talent]) page.on('pageerror', (err) => errors.push(err.message))
  await client.goto('http://127.0.0.1:5179/api/__test/session?role=client')
  await client.getByRole('button', { name: 'Accept', exact: false }).waitFor()
  await client.screenshot({ path: 'test-results/messaging-desktop.png', fullPage: true })
  for (const width of [320, 390, 768, 1280, 1440]) {
    await client.setViewportSize({ width, height: 1000 })
    assert.equal(await client.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `page overflow at ${width}`)
    for (const name of ['Messages', 'Wallet', 'Admin']) {
      const link = client.getByRole('link', { name, exact: true }).first()
      assert.equal(await link.isVisible(), true, `${name} missing at ${width}`)
      const box = await link.boundingBox()
      assert.ok(box.x >= 0 && box.x + box.width <= width, `${name} clipped at ${width}`)
    }
  }
  await client.setViewportSize({ width: 390, height: 844 })
  await client.screenshot({ path: 'test-results/messaging-mobile.png', fullPage: true })
  await client.getByLabel('Message', { exact: true }).fill('email@example.com')
  await client.getByRole('button', { name: 'Send', exact: true }).click()
  await client.getByRole('alert').filter({ hasText: 'Contact details and external links' }).waitFor()
  assert.equal(await client.getByLabel('Message', { exact: true }).inputValue(), 'email@example.com')
  await client.getByLabel('Message', { exact: true }).fill('For a shorter highlight reel.')
  await client.getByRole('button', { name: 'Counteroffer', exact: true }).click()
  await client.getByLabel('Offer amount (NGN)').fill('8000')
  await client.getByRole('button', { name: 'Send offer', exact: true }).click()
  await client.getByText('Your offer:', { exact: false }).waitFor()
  await talent.goto('http://127.0.0.1:5179/api/__test/session?role=talent')
  await talent.getByRole('button', { name: /Accept.*8,000/ }).click()
  await talent.getByText('accepted', { exact: false }).first().waitFor()
  await client.reload()
  await client.getByRole('button', { name: 'Pay from wallet', exact: true }).waitFor({ state: 'visible' })
  await client.getByRole('button', { name: 'Pay from wallet', exact: true }).click()
  await client.getByText('Contact sharing unlocked.', { exact: true }).waitFor()
  await client.getByLabel('Message', { exact: true }).fill('email@example.com')
  await client.getByRole('button', { name: 'Send', exact: true }).click()
  await client.locator('article').filter({ hasText: 'email@example.com' }).waitFor()
  assert.equal(await client.getByRole('button', { name: 'Make an offer', exact: true }).count(), 0)
  await talent.reload()
  await talent.getByText('Contact sharing unlocked.', { exact: true }).waitFor()
  await talent.locator('article').filter({ hasText: 'email@example.com' }).waitFor()
  await talent.screenshot({ path: 'test-results/messaging-secured-mobile.png', fullPage: true })
  assert.deepEqual(errors, [])
  console.log('UI passed: 320/390/768/1280/1440px; contact blocking preserves draft; counteroffer, acceptance, wallet funding, contact unlock; no page errors.')
} finally { await browser?.close(); await vite.close(); await closePreview() }
