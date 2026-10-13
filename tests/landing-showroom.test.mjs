import test from 'node:test'
import assert from 'node:assert/strict'
import { decideLanding, HOME_PATH } from '../src/lib/landing.js'
import {
  containsContactBypass,
  showroomTextIssue,
  encodeShowroomCursor,
  decodeShowroomCursor,
} from '../api/_lib/showroomEligibility.js'

test('Home always opens Showroom even with legacy Bento preferences or active client deals', () => {
  assert.equal(HOME_PATH, '/showroom')
  for (const options of [
    { role: 'talent' },
    { role: 'client', hasActiveClientDeals: false },
    { role: 'client', hasActiveClientDeals: true },
    { role: 'dual', hasActiveClientDeals: true },
    { role: 'client', remembered: 'bento', hasActiveClientDeals: true },
    { role: 'talent', remembered: 'bento' },
  ]) assert.equal(decideLanding(options), '/showroom')
})

test('Showroom text checks catch obvious bypass instructions but permit ordinary project descriptions', () => {
  for (const example of [
    'DM me on WhatsApp', 'Contact my email test@example.com',
    'View my portfolio at https://example.com',
    'Reach me on 08031234567', 't.me/channel',
  ]) assert.equal(containsContactBypass(example), true, example)
  assert.equal(containsContactBypass('Wedding photographer, 6 months experience in Lagos'), false)
  assert.equal(showroomTextIssue({ title: 'Photographer', media: [{ caption: 'Call 08031234567' }] })?.includes('Remove contact'), true)
})

test('Showroom keyset cursor rejects invalid and round-trips valid values', () => {
  const item = {
    score: 52,
    created_at: '2026-10-11T07:00:00.000Z',
    id: '11111111-1111-4111-8111-111111111111',
  }
  const cursor = encodeShowroomCursor(item)
  assert.deepEqual(decodeShowroomCursor(cursor), { score: 52, date: item.created_at, id: item.id })
  assert.throws(() => decodeShowroomCursor('invalid'), /Invalid Showroom/)
})

test('Showroom discovery is paginated and navigation is separate from deal execution', async () => {
  const { readFile } = await import('node:fs/promises')
  const read = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
  const [api, screen, app, feed, nav, layout, eligibility] = await Promise.all([
    read('api/showroom/index.js'), read('src/components/Showroom.jsx'),
    read('src/App.jsx'), read('src/pages/Feed.jsx'),
    read('src/lib/nav.js'), read('src/components/Layout.jsx'),
    read('api/_lib/showroomEligibility.js'),
  ])
  assert.match(api, /PAGE_SIZE = 24/)
  assert.match(api, /nextCursor/)
  assert.match(api, /NOT EXISTS/)
  assert.match(api, /rank_score DESC/)
  assert.doesNotMatch(api, /LIMIT 12/)
  assert.match(screen, /Load|loadMore/)
  assert.match(screen, /New & Rising/)
  assert.match(screen, /Near You/)
  assert.doesNotMatch(screen, /nextLap\(/)
  assert.match(app, /path="\/bento"/)
  assert.match(feed, /Search talents and clients/)
  assert.doesNotMatch(feed, /role: hatRole|useBrowseRole/)
  assert.match(nav, /label: 'Home'/)
  assert.match(nav, /label: 'Bento'/)
  assert.doesNotMatch(layout, /Talent\/Client toggle|setBrowseRole/)
  assert.doesNotMatch(screen, /Ready to hire\?|<h1 className="text-\[20px\].*Showroom/)
  assert.match(eligibility, /SHOWROOM_SQL_CONTACT_PATTERN/)
})
