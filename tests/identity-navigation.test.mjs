import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

// Renders the real components on the server (no browser needed) and checks the
// links they produce, then exercises the click handlers directly.
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

// React 18 warns that useLayoutEffect does nothing on the server; irrelevant here.
const realError = console.error
console.error = (...args) => {
  if (String(args[0]).includes('useLayoutEffect does nothing on the server')) return
  realError(...args)
}
after(() => { console.error = realError })

const { default: UserIdentity, ProfileLink } = await vite.ssrLoadModule('/src/components/UserIdentity.jsx')
const { default: BentoCard } = await vite.ssrLoadModule('/src/components/BentoCard.jsx')
const { default: ShowroomPost } = await vite.ssrLoadModule('/src/components/ShowroomPost.jsx')
const { default: ProfileHeader } = await vite.ssrLoadModule('/src/components/profile/ProfileHeader.jsx')

const h = React.createElement
const render = (element) => renderToStaticMarkup(h(StaticRouter, { location: '/' }, element))

function anchors(html) {
  const found = []
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    assert.doesNotMatch(m[2], /<a\b/, 'links must never be nested inside links')
    found.push({
      href: /href="([^"]*)"/.exec(m[1])?.[1],
      part: /data-identity="([^"]*)"/.exec(m[1])?.[1],
      text: m[2].replace(/<[^>]*>/g, '').trim(),
    })
  }
  return found
}
const identityLinks = (html) => anchors(html).filter((a) => a.part)

const talent = { role: 'talent', fullName: 'Sarverun Simeon Tertese', username: 'simeon' }
const client = { role: 'client', fullName: 'Simeon Laboratories', companySuffix: 'Ltd.', username: 'silabs' }

const talentHat = {
  id: '11111111-1111-4111-8111-111111111111',
  role: 'talent',
  owner_role: 'talent',
  username: 'simeon',
  owner_full_name: 'Sarverun Simeon Tertese',
  hat_title: 'Wedding Photographer',
  lga: 'Gwagwalada',
  hires: 3,
  availability: true,
  available_from: '09:00:00',
  available_to: '17:00:00',
  price_type: 'fixed',
  rate: 25000,
  rate_unit: 'hour',
  likes: 2,
  motto: 'Moments, kept.',
}
const clientHat = {
  ...talentHat,
  id: '22222222-2222-4222-8222-222222222222',
  role: 'client',
  owner_role: 'client',
  username: 'silabs',
  owner_full_name: 'Simeon Laboratories',
  owner_company_suffix: 'Ltd.',
}

test('UserIdentity (talent): avatar, full name and ^username all link to /profile/:username', () => {
  const html = render(h(UserIdentity, { user: talent }))
  const links = identityLinks(html)
  assert.deepEqual(links.map((l) => l.part), ['avatar', 'name', 'username'])
  assert.deepEqual(new Set(links.map((l) => l.href)), new Set(['/profile/simeon']))
  assert.equal(links.find((l) => l.part === 'name').text, 'Sarverun Simeon Tertese')
  assert.equal(links.find((l) => l.part === 'username').text, '^simeon')
})

test('UserIdentity (client): business name + suffix, username without ^', () => {
  const html = render(h(UserIdentity, { user: client }))
  const links = identityLinks(html)
  assert.deepEqual(new Set(links.map((l) => l.href)), new Set(['/profile/silabs']))
  assert.equal(links.find((l) => l.part === 'name').text, 'Simeon Laboratories Ltd.')
  assert.equal(links.find((l) => l.part === 'username').text, 'silabs')
  assert.doesNotMatch(html, /\^silabs/)
})

test('UserIdentity does not duplicate the suffix or the ^, and never prints undefined/null', () => {
  const dupSuffix = render(h(UserIdentity, { user: { ...client, fullName: 'Silabs Ltd.' } }))
  assert.match(dupSuffix, />Silabs Ltd\.</)
  assert.doesNotMatch(dupSuffix, /Ltd\. Ltd\./)
  assert.doesNotMatch(render(h(UserIdentity, { user: { ...talent, username: '^simeon' } })), /\^\^/)
  for (const user of [undefined, null, {}, { role: 'client' }, { username: null, fullName: null }]) {
    const html = render(h(UserIdentity, { user }))
    assert.doesNotMatch(html, /undefined|null/)
    assert.equal(anchors(html).length, 0, 'no username means no link, only plain text')
  }
  // Only a username on file: one line, not the same handle twice.
  const bare = identityLinks(render(h(UserIdentity, { user: { role: 'talent', username: 'bob' } })))
  assert.deepEqual(bare.map((l) => l.part), ['avatar', 'name'])
  assert.equal(bare.find((l) => l.part === 'name').text, '^bob')
})

test('UserIdentity inline layout links the same way', () => {
  const links = identityLinks(render(h(UserIdentity, { user: talent, layout: 'inline' })))
  assert.deepEqual(links.map((l) => l.part), ['avatar', 'name', 'username'])
  assert.deepEqual(new Set(links.map((l) => l.href)), new Set(['/profile/simeon']))
})

test('BentoCard keeps its compact card and links the identity to the profile, not the hat', () => {
  const html = render(h(BentoCard, { hat: talentHat }))
  const links = identityLinks(html)
  assert.deepEqual(links.map((l) => l.part), ['avatar', 'name', 'username'])
  assert.deepEqual(new Set(links.map((l) => l.href)), new Set(['/profile/simeon']))
  assert.equal(links.find((l) => l.part === 'name').text, 'Sarverun Simeon Tertese')
  assert.equal(links.find((l) => l.part === 'username').text, '^simeon')
  assert.doesNotMatch(html, /\/talent\//)
  assert.doesNotMatch(html, /<img[^>]*(?:hat_media|showroom)/) // still text-only
  for (const kept of ['Moments, kept.', 'Hats:', 'Available:', 'Time:', '3 jobs', 'Gwagwalada']) {
    assert.ok(html.includes(kept), `BentoCard still shows "${kept}"`)
  }
})

test('BentoCard for a client hat shows the business identity', () => {
  const html = render(h(BentoCard, { hat: clientHat }))
  const links = identityLinks(html)
  assert.deepEqual(new Set(links.map((l) => l.href)), new Set(['/profile/silabs']))
  assert.equal(links.find((l) => l.part === 'name').text, 'Simeon Laboratories Ltd.')
  assert.equal(links.find((l) => l.part === 'username').text, 'silabs')
  assert.doesNotMatch(html, /\^silabs/)
  assert.ok(html.includes('3 hires'))
})

test('Showroom post shows Full Name over ^username instead of @username', () => {
  const html = render(
    h(ShowroomPost, {
      hat: { ...talentHat, media: [] },
      postKey: 'k~0',
      playing: false,
      muted: true,
      onMutedChange() {},
      onLike() {},
      onShare() {},
      onView() {},
      observe: () => () => {},
    }),
  )
  const links = identityLinks(html)
  assert.deepEqual(links.map((l) => l.part), ['avatar', 'name', 'username'])
  assert.deepEqual(new Set(links.map((l) => l.href)), new Set(['/profile/simeon']))
  assert.equal(links.find((l) => l.part === 'username').text, '^simeon')
  assert.doesNotMatch(html, /@simeon/)
  assert.doesNotMatch(html, /\/talent\//)
})

test('Profile header: same identity, same helpers', () => {
  globalThis.window = { location: { origin: 'https://chombutar.test' } } // ProfileHeader builds its share URL while rendering
  after(() => { delete globalThis.window })
  const html = render(h(ProfileHeader, { user: { ...talent, avatarUrl: null }, isOwner: false, isVerified: false }))
  assert.match(html, /<h1[^>]*>.*Sarverun Simeon Tertese.*<\/h1>/)
  const links = identityLinks(html)
  assert.equal(links.find((l) => l.part === 'username').text, '^simeon')
  assert.deepEqual(new Set(links.map((l) => l.href)), new Set(['/profile/simeon']))

  const business = render(h(ProfileHeader, { user: { ...client, avatarUrl: null }, isOwner: false, isVerified: false }))
  const businessLinks = identityLinks(business)
  assert.equal(businessLinks.find((l) => l.part === 'name').text, 'Simeon Laboratories Ltd.')
  assert.equal(businessLinks.find((l) => l.part === 'username').text, 'silabs')
})

// ── click behaviour ──────────────────────────────────────────────────────────
// Walks a rendered element tree and calls ProfileLink (a plain function) to get
// the <Link> each identity part produces, so its onClick can be exercised.
function profileLinkProps(element, found = []) {
  if (!element || typeof element !== 'object') return found
  if (Array.isArray(element)) {
    element.forEach((child) => profileLinkProps(child, found))
    return found
  }
  if (element.type === ProfileLink) {
    found.push(element.type(element.props).props)
    return found
  }
  if (typeof element.type === 'function' && element.type !== ProfileLink) return found
  return profileLinkProps(element.props?.children, found)
}

test('profile clicks stop at the link: they never reach a parent card, modal, View or booking action', () => {
  const tree = UserIdentity({ user: talent })
  const links = profileLinkProps(tree)
  assert.equal(links.length, 3)
  for (const link of links) {
    assert.equal(link.to, '/profile/simeon')

    // What a parent (BentoCard's article, a Showroom post, a modal overlay...) does on click.
    let parentActions = 0
    const parent = () => { parentActions += 1 }
    const event = {
      stopped: false,
      prevented: false,
      stopPropagation() { this.stopped = true },
      preventDefault() { this.prevented = true },
    }
    link.onClick(event)
    if (!event.stopped) parent(event) // React only bubbles to the parent if nobody stopped it

    assert.equal(event.stopped, true)
    assert.equal(parentActions, 0)
    assert.equal(event.prevented, false, 'the link itself must still navigate')
  }
})

test('without a username there is no link to click', () => {
  const parts = profileLinkProps(UserIdentity({ user: {} }))
  assert.ok(parts.length > 0)
  for (const part of parts) {
    assert.equal(part.to, undefined)
    assert.equal(part.onClick, undefined)
  }
})
