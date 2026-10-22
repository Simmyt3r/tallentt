import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('Vibes composer retains pre-PR33 height, creator handle stays prefixed and media screening remains automatic',()=>{
  const page=read('src/pages/Vibes.jsx')
  const server=read('api/vibes/index.js')
  assert.match(page,/\^'\+String\(user\.username/)
  assert.match(page,/rows=\{2\} placeholder="Say something…"/)
  assert.doesNotMatch(page,/rows=\{1\} placeholder="Say something…"/)
  assert.match(page,/Most uploads publish automatically after safety screening/)
  assert.match(server,/videoModeration/)
  assert.match(server,/moderation_status/)
  assert.match(server,/vibes_reports/)
})

test('Showroom media caption is collected in step three and displayed below the media',()=>{
  const add=read('src/components/AddShowroomMedia.jsx')
  const post=read('src/components/ShowroomPost.jsx')
  assert.match(add,/step === 3/)
  assert.match(add,/Showroom media caption/)
  assert.match(add,/This caption appears on the Showroom post/)
  assert.match(post,/const caption = media\?\.caption/)
  assert.match(post,/\{caption\}/)
})

test('shared discovery input avoids native X and original cross-tab Back behavior is preserved',()=>{
  const input=read('src/components/DiscoverySearch.jsx')
  const layout=read('src/components/Layout.jsx')
  assert.match(input,/type="text" inputMode="search"/)
  assert.doesNotMatch(input,/type="search"/)
  assert.match(layout,/useNavigationType/)
  assert.match(layout,/navigationType==='POP'/)
  assert.match(layout,/navigate\('\/showroom',\{replace:true\}\)/)
  assert.match(layout,/to="\/chats" aria-label="Open general chat"/)
})

test('BentoCards display real account-level Orbit and notifications retain the original searchable field',()=>{
  const bento=read('src/components/BentoCard.jsx')
  const notifications=read('src/pages/Notifications.jsx')
  assert.match(bento,/useAccountOrbit\(hat\.username\)/)
  assert.match(bento,/Orbit \{accountOrbitScore/)
  assert.doesNotMatch(notifications,/aria-label="Search notifications"/)
  assert.match(notifications,/<DiscoverySearch value=\{search\} onChange=\{setSearch\}/)
  assert.match(notifications,/placeholder="Search notifications…"/)
})

test('admin keeps original liability and income summary layout while read-only liability API remains available',()=>{
  const finance=read('api/_lib/financeReporting.js')
  const ui=read('src/components/AdminFinanceLedger.jsx')
  const api=read('api/admin/index.js')
  assert.match(finance,/financeLiabilityAudit/)
  assert.match(finance,/LIABILITY_AUDIT_TYPES/)
  assert.match(finance,/net_profit:null/)
  assert.doesNotMatch(ui,/View liability audit/)
  assert.match(ui,/Net profit: <strong>Not established<\/strong>/)
  assert.match(ui,/aria-label="Platform owner revenue"/)
  assert.match(ui,/Audit trail/)
  assert.match(api,/finance_liability_audit/)
})

test('Live broadcaster refuses error/HTML health responses and names the required external transport',()=>{
  const media=read('api/_lib/liveMedia.js')
  const hub=read('src/pages/Live/LiveHub.jsx')
  const broadcaster=read('src/lib/liveBroadcast.js')
  assert.match(media,/if \(!response\.ok\)/)
  assert.match(media,/unexpected_health_response/)
  assert.match(hub,/LIVE_MEDIA_SERVER_URL/)
  assert.match(hub,/WHIP and HLS must be HTTPS/)
  assert.match(broadcaster,/missing or incorrectly routed/)
})
