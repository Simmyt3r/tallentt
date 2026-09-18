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
    // Below the md breakpoint, Messages/Wallet/Admin live behind the mobile
    // drawer (hamburger), not the desktop sidebar — open it the way a real
    // phone user would before checking those links.
    const mobile = width < 768
    if (mobile) {
      await client.getByRole('button', { name: 'Open menu', exact: true }).click()
      await client.waitForTimeout(250) // let the 200ms slide-in transition settle before measuring
    }
    for (const name of ['Messages', 'Wallet', 'Admin']) {
      const link = client.getByRole('link', { name, exact: true }).first()
      assert.equal(await link.isVisible(), true, `${name} missing at ${width}`)
      const box = await link.boundingBox()
      assert.ok(box.x >= 0 && box.x + box.width <= width, `${name} clipped at ${width}`)
    }
    if (mobile) await client.getByRole('button', { name: 'Close menu', exact: true }).click()
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
  await talent.getByRole('button', { name: 'Submit work', exact: true }).click()
  await talent.getByLabel('Booking update', { exact: true }).fill('The highlight reel is complete, including the agreed music and colours.')
  await talent.getByRole('button', { name: 'Confirm submit work', exact: true }).click()
  await talent.getByRole('heading', { name: 'Awaiting delivery review', exact: true }).waitFor()
  await client.reload()
  await client.getByRole('button', { name: 'Request revisions', exact: true }).click()
  await client.getByLabel('Booking update', { exact: true }).fill('Please brighten the final scene.')
  await client.getByRole('button', { name: 'Confirm request revisions', exact: true }).click()
  await client.getByRole('heading', { name: 'Revisions requested', exact: true }).waitFor()
  await talent.reload()
  await talent.getByRole('button', { name: 'Submit work', exact: true }).click()
  await talent.getByLabel('Booking update', { exact: true }).fill('The final scene is now brighter.')
  await talent.getByRole('button', { name: 'Confirm submit work', exact: true }).click()
  await talent.getByRole('heading', { name: 'Awaiting delivery review', exact: true }).waitFor()
  await client.reload()
  await client.getByRole('button', { name: 'Approve and release payment', exact: true }).click()
  await client.getByRole('button', { name: 'Confirm approve and release payment', exact: true }).click()
  await client.getByRole('heading', { name: 'Completed', exact: true }).waitFor()
  await client.screenshot({ path: 'test-results/completion-mobile.png' })
  await client.goto('http://127.0.0.1:5179/messages?escrow=55555555-5555-4555-8555-555555555555')
  await client.getByRole('button', { name: 'Open dispute', exact: true }).click()
  await client.getByLabel('Booking update', { exact: true }).fill('The event was cancelled before any work was delivered. Please return the booking payment.')
  await client.getByRole('button', { name: 'Confirm open dispute', exact: true }).click()
  await client.getByRole('heading', { name: 'Dispute under review', exact: true }).waitFor()
  assert.equal(await client.getByRole('button', { name: 'Approve and release payment', exact: true }).count(), 0)
  await talent.goto('http://127.0.0.1:5179/messages?escrow=55555555-5555-4555-8555-555555555555')
  await talent.getByLabel('Message', { exact: true }).fill('I confirm the event was cancelled before delivery and agree to a wallet refund.')
  await talent.getByRole('button', { name: 'Send', exact: true }).click()
  await talent.locator('article').filter({ hasText: 'agree to a wallet refund' }).waitFor()
  const admin = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  admin.on('pageerror', (err) => errors.push(err.message))
  await admin.goto('http://127.0.0.1:5179/api/__test/session?role=admin')
  await admin.getByRole('button', { name: 'Review dispute', exact: true }).click()
  await admin.getByRole('heading', { name: 'Conversation evidence', exact: true }).waitFor()
  await admin.locator('article').filter({ hasText: 'agree to a wallet refund' }).waitFor()
  for (const width of [320, 390, 768, 1280, 1440]) {
    await admin.setViewportSize({ width, height: 1000 })
    assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `admin case overflow at ${width}`)
  }
  await admin.getByRole('heading', { name: /Dispute.*open/ }).evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await admin.screenshot({ path: 'test-results/dispute-admin-desktop.png' })
  await admin.setViewportSize({ width: 390, height: 844 })
  await admin.getByLabel('Decision', { exact: true }).selectOption('resolve_refund')
  await admin.getByLabel('Resolution reason', { exact: true }).fill('The conversation confirms cancellation before delivery. Return the full amount to the client wallet.')
  await admin.getByRole('button', { name: 'Review settlement', exact: true }).click()
  await admin.getByRole('button', { name: 'Confirm settlement', exact: true }).evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await admin.screenshot({ path: 'test-results/dispute-admin-mobile.png' })
  await admin.getByRole('button', { name: 'Confirm settlement', exact: true }).click()
  await admin.getByRole('heading', { name: /Dispute.*refunded/ }).waitFor()
  await client.reload()
  await client.getByRole('heading', { name: 'Refunded to wallet', exact: true }).waitFor()
  await client.getByText('This conversation is read-only because the booking is closed.', { exact: true }).waitFor()
  const wallet = await client.evaluate(async () => (await (await fetch('/api/escrows?wallet=1')).json()).wallet)
  assert.equal(wallet.balance, 42000)
  assert.equal(wallet.transactions.filter((t) => t.type === 'refund').length, 1)
  await client.screenshot({ path: 'test-results/refunded-mobile.png' })
  assert.deepEqual(errors, [])
  console.log('UI passed: 320/390/768/1280/1440px; negotiation, funding, contact unlock, delivery, revisions, approval, dispute evidence, admin refund, correct wallet balance; no page errors.')
} finally { await browser?.close(); await vite.close(); await closePreview() }
