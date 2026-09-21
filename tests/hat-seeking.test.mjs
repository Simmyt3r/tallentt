import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import {
  FIELD_IDS,
  HAT_SEEKING_MAX,
  HAT_TITLE_MAX,
  buildPayload,
  buildPreview,
  emptyForm,
  hydrateForm,
  roleCopy,
  summarizeErrors,
  validateForm,
} from '../src/lib/hatForm.js'
import { hatSeeking } from '../src/lib/hatSeeking.js'

// A Hat's title is the name its owner gives it; "Seeking" / "Hiring" is what
// the Hat is for. They are two values, entered separately and shown separately.
const filled = (over = {}) => ({
  ...emptyForm({}),
  title: 'Weekend weddings',
  seeking: 'Wedding photographer',
  category: 'Photography',
  deliveryMode: 'Remote',
  amount: '25000',
  ...over,
})
const ctx = (role) => ({ role, media: { ready: 1, uploading: 0, failed: 0 } })

test('hatSeeking: its own value, with the title standing in only for older Hats', () => {
  assert.equal(hatSeeking({ hat_title: 'Weekend weddings', seeking: 'Wedding photographer' }), 'Wedding photographer')
  assert.equal(hatSeeking({ hat_title: 'Editing', seeking: null }), 'Editing')
  assert.equal(hatSeeking({ hat_title: 'Editing' }), 'Editing')
  assert.equal(hatSeeking({ hat_title: 'Editing', seeking: '   ' }), 'Editing')
  assert.equal(hatSeeking({ hat_title: ' A ', seeking: ' B ' }), 'B')
  for (const nothing of [undefined, null, {}, { seeking: null, hat_title: null }]) {
    assert.equal(hatSeeking(nothing), '')
  }
})

test('the form keeps the title and the seeking value apart', () => {
  const blank = emptyForm({})
  assert.equal(blank.title, '')
  assert.equal(blank.seeking, '')

  const stored = hydrateForm({ hat_title: 'Weekend weddings', seeking: 'Wedding photographer', price_type: 'fixed' })
  assert.equal(stored.title, 'Weekend weddings')
  assert.equal(stored.seeking, 'Wedding photographer')

  // A Hat made before the two were separated shows its old text in both boxes.
  const legacy = hydrateForm({ hat_title: 'Editing', price_type: 'fixed' })
  assert.equal(legacy.title, 'Editing')
  assert.equal(legacy.seeking, 'Editing')
})

test('the title and the seeking value are validated separately', () => {
  const missingBoth = validateForm(filled({ title: '', seeking: '' }), ctx('talent'))
  assert.equal(missingBoth.title, 'Give your Hat a title.')
  assert.equal(missingBoth.seeking, roleCopy('talent').seekingRequired)

  const onlySeeking = validateForm(filled({ title: '   ' }), ctx('talent'))
  assert.ok(onlySeeking.title)
  assert.equal(onlySeeking.seeking, undefined)

  const onlyTitle = validateForm(filled({ seeking: '' }), ctx('client'))
  assert.equal(onlyTitle.title, undefined)
  assert.equal(onlyTitle.seeking, roleCopy('client').seekingRequired)

  assert.ok(validateForm(filled({ title: 'x'.repeat(HAT_TITLE_MAX + 1) }), ctx('talent')).title)
  assert.ok(validateForm(filled({ seeking: 'x'.repeat(HAT_SEEKING_MAX + 1) }), ctx('talent')).seeking)

  const ok = validateForm(filled(), ctx('talent'))
  assert.equal(ok.title, undefined)
  assert.equal(ok.seeking, undefined)
})

test('both fields are reachable from the error summary, labelled for the kind of Hat', () => {
  assert.equal(FIELD_IDS.title, 'hat-title')
  assert.equal(FIELD_IDS.seeking, 'hat-seeking')
  const errors = { title: 'x', seeking: 'y' }
  assert.deepEqual(summarizeErrors(errors, 'talent').map((r) => r.label), ['Hat title', 'Seeking'])
  assert.deepEqual(summarizeErrors(errors, 'client').map((r) => r.label), ['Hat title', 'Hiring'])
})

test('the form sends and previews both values, trimmed', () => {
  const form = filled({ title: '  Weekend weddings ', seeking: ' Wedding photographer  ' })
  for (const mode of ['create', 'edit']) {
    const body = buildPayload(form, { mode, role: 'talent' })
    assert.equal(body.hat_title, 'Weekend weddings')
    assert.equal(body.seeking, 'Wedding photographer')
  }
  const preview = buildPreview(form, { role: 'client' })
  assert.equal(preview.title, 'Weekend weddings')
  assert.equal(preview.seeking, 'Wedding photographer')
  assert.equal(preview.listingLabel, 'Hiring')
})

test('the seeking prompt is role-aware and no longer called the title', () => {
  assert.equal(roleCopy('talent').seekingQuestion, 'What service are you available for?')
  assert.equal(roleCopy('client').seekingQuestion, 'Who are you looking for?')
  assert.equal(roleCopy('talent').titleQuestion, undefined)
})

// ── What people see on the feed card and in its detail view ─────────────────
const require = createRequire(import.meta.url)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { StaticRouter } = require('react-router-dom/server')

const vite = await createServer({
  configFile: false,
  root: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [react()],
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'silent',
  optimizeDeps: { noDiscovery: true, include: [] },
})
after(() => vite.close())
const realError = console.error
console.error = (...args) => {
  if (String(args[0]).includes('useLayoutEffect does nothing on the server')) return
  realError(...args)
}
after(() => { console.error = realError })

const { default: BentoCard } = await vite.ssrLoadModule('/src/components/BentoCard.jsx')
const { default: BentoCardDetailModal } = await vite.ssrLoadModule('/src/components/BentoCardDetailModal.jsx')
const h = React.createElement
const textOf = (element) =>
  renderToStaticMarkup(h(StaticRouter, { location: '/' }, element))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')

const talentHat = {
  id: '11111111-1111-4111-8111-111111111111',
  role: 'talent',
  owner_role: 'talent',
  username: 'simeon',
  owner_full_name: 'Sarverun Simeon Tertese',
  hat_title: 'Weekend weddings',
  seeking: 'Wedding photographer',
  price_type: 'fixed',
  rate: 25000,
  rate_unit: 'hour',
}

test('BentoCard: "Hats" shows the hat title, "Available" shows what it is seeking', () => {
  const text = textOf(h(BentoCard, { hat: talentHat }))
  assert.match(text, /Hats: Weekend weddings/)
  assert.match(text, /Available: Wedding photographer/)
  assert.doesNotMatch(text, /Available: Weekend weddings/)
  assert.doesNotMatch(text, /Hats: Wedding photographer/)
})

test('BentoCard for a client Hat: "Hiring" shows what it is hiring for', () => {
  const text = textOf(h(BentoCard, { hat: { ...talentHat, role: 'client', owner_role: 'client', hat_title: 'Q3 shoot crew', seeking: 'Video editor' } }))
  assert.match(text, /Hats: Q3 shoot crew/)
  assert.match(text, /Hiring: Video editor/)
})

test('BentoCard for a Hat that predates the split still shows its old text in both places', () => {
  const { seeking, ...legacy } = talentHat
  const text = textOf(h(BentoCard, { hat: { ...legacy, hat_title: 'Editing' } }))
  assert.match(text, /Hats: Editing/)
  assert.match(text, /Available: Editing/)
})

test('detail view: the title is the heading, seeking is its own line', () => {
  const text = textOf(h(BentoCardDetailModal, { hat: talentHat, onClose() {} }))
  assert.match(text, /Weekend weddings Seeking Wedding photographer/)
  const client = textOf(h(BentoCardDetailModal, { hat: { ...talentHat, role: 'client', hat_title: 'Q3 shoot crew', seeking: 'Video editor' }, onClose() {} }))
  assert.match(client, /Q3 shoot crew Hiring Video editor/)
})
