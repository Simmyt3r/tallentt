import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const primaryScreens = [
  'src/pages/Feed.jsx',
  'src/pages/Vibes.jsx',
  'src/pages/Inbox.jsx',
  'src/pages/Negotiations.jsx',
  'src/pages/Notifications.jsx',
  'src/pages/MyDeals.jsx',
  'src/pages/Settings.jsx',
  'src/pages/Wallet.jsx',
  'src/pages/DisputeCenter.jsx',
  'src/pages/Admin.jsx',
  'src/pages/Profile.jsx',
  'src/pages/PublicProfile.jsx',
  'src/pages/DealDetails.jsx',
  'src/pages/TalentProfile.jsx',
  'src/pages/Live/LiveHub.jsx',
  'src/pages/Live/StageRoom.jsx',
  'src/pages/Live/StageCompetitions.jsx',
  'src/pages/Live/StageCompetitionRoom.jsx',
  'src/components/MyHats.jsx',
  'src/components/HatForm.jsx',
]

test('primary authenticated screens use the shared compact sticky header', () => {
  for (const path of primaryScreens) {
    assert.match(read(path), /CompactPageHeader/, `${path} should use CompactPageHeader`)
  }

  const header = read('src/components/CompactPageHeader.jsx')
  assert.match(header, /sticky top-\[57\.5px\] md:top-16/)
  assert.match(header, /h-\[52px\]/)
  assert.match(header, /<h1[^>]*>\{title\}<\/h1>/)
  assert.match(header, /<DiscoverySearch/)
})

test('global search from screens without a local list filter opens Showroom with the query', () => {
  const header = read('src/components/CompactPageHeader.jsx')
  assert.ok(header.includes("navigate(`/showroom?q=${encodeURIComponent(query)}`)"))

  const showroom = read('src/components/Showroom.jsx')
  assert.match(showroom, /new URLSearchParams\(location\.search\)\.get\('q'\)/)
  assert.match(showroom, /if \(query !== null\) setSearch\(\(current\) => current === query \? current : query\)/)
})

test('list searches remain connected to their own records', () => {
  assert.match(read('src/pages/Negotiations.jsx'), /category\(item, user\.id\) === activeTab &&/)
  assert.match(read('src/pages/DisputeCenter.jsx'), /const visible = cases\.filter/)
  assert.match(read('src/pages/Live/LiveHub.jsx'), /const visibleRooms = rooms\.filter/)
  assert.match(read('src/pages/Live/StageCompetitions.jsx'), /const visibleItems=items\.filter/)
  assert.match(read('src/pages/Wallet.jsx'), /Search wallet activity/)
  assert.match(read('src/pages/Inbox.jsx'), /searchValue=\{terms\[tab\]\}/)
})
