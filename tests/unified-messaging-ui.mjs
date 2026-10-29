import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { preview } from 'vite'
import { optOutPageToursForFixture } from './page-tour-fixture.mjs'

const user = { id: '11111111-1111-4111-8111-111111111111', username: 'alice', full_name: 'Alice', role: 'dual' }
const date = '2026-10-28T12:00:00Z'
const messages = [{ id: 'one', sender_id: 'bob', body: 'Can we meet tomorrow?', created_at: date, read_at: null },
  { id: 'two', sender_id: user.id, body: 'Yes, that works.', created_at: date, read_at: date }]
const actions = [], errors = []
const server = await preview({ preview: { host: '127.0.0.1', port: 5188, strictPort: true } })
let browser
try {
  browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'], executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })
  await optOutPageToursForFixture(context)
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), q = url.searchParams
    let result = {}
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON(); actions.push(body)
      if (body.action === 'community_send') messages.push({ id: 'three', sender_id: user.id, body: body.text, created_at: date, reply_body: messages[0].body, reply_sender_id: 'bob' })
      result = { ok: true }
    } else if (url.pathname === '/api/auth') result = { user }
    else if (q.has('conversations')) result = { conversations: [{ id: 'deal', hat_title: 'Portrait session', peer_full_name: 'Clara', peer_username: 'clara', unread_count: 1, last_message: 'The photos are ready.', last_at: date }], nextCursor: null }
    else if (q.has('community_thread')) result = { thread: { id: 'chat', status: 'accepted', peer_name: 'Bob', peer_username: 'bob' }, messages }
    else if (q.has('community')) result = { threads: [{ id: 'chat', status: 'accepted', peer_name: 'Bob', peer_username: 'bob', last_message: 'Yes, that works.', last_at: date, unread_count: 0 }] }
    else if (q.has('messages')) result = { thread: { id: 'deal', hat_title: 'Portrait session', peer: { full_name: 'Clara', username: 'clara' }, status: 'not_funded', amount: 1000 }, messages: [{ id: '1', kind: 'message', body: 'The photos are ready.', sender_id: 'clara', created_at: date }], nextCursor: null }
    else result = { notifications: [], count: 0, unread: 0 }
    await route.fulfill({ json: result })
  })
  await page.goto('http://127.0.0.1:5188/inbox', { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.getByRole('heading', { name: 'Chats', exact: true }).waitFor()
  const list = page.getByRole('complementary', { name: 'Conversations' })
  await list.getByText('Clara', { exact: true }).waitFor()
  await list.getByText('Bob', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Unread', exact: true }).click()
  assert.equal(await list.getByText('Bob', { exact: true }).count(), 0)
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await list.getByText('Bob', { exact: true }).click()
  await page.getByText('Seen', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Reply to Can we meet tomorrow?', exact: true }).click()
  await page.getByLabel('Message', { exact: true }).fill('Let’s meet at ten.')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await page.getByText('Let’s meet at ten.', { exact: true }).waitFor()
  assert.ok(actions.some(x => x.action === 'community_send' && x.reply_to_id === 'one'))
  assert.ok(actions.some(x => x.action === 'community_read'))
  await mkdir('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/unified-messaging-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await list.isVisible(), false)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.screenshot({ path: 'test-results/unified-messaging-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Back to conversations', exact: true }).click()
  await list.getByText('Clara', { exact: true }).click()
  await page.getByText('The photos are ready.', { exact: true }).last().waitFor()
  await page.getByRole('button', { name: 'Reply to The photos are ready.', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel reply', exact: true }).waitFor()
  assert.deepEqual(errors, [])
  console.log('Unified inbox UI passed: combined list, unread filter, quoted reply, read status, Bento thread, mobile navigation and overflow.')
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)) }
