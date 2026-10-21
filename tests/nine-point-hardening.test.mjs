import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('Vibes composer stays compact, creator handle stays prefixed and media screening remains automatic',()=>{
  const page=read('src/pages/Vibes.jsx')
  const server=read('api/vibes/index.js')
  assert.match(page,/\^'\+String\(user\.username/)
  assert.match(page,/rows=\{1\} placeholder="Say something…"/)
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

test('shared discovery inputs avoid confusing native X; history uses actual browser Back behavior',()=>{
  const input=read('src/components/DiscoverySearch.jsx')
  const layout=read('src/components/Layout.jsx')
  assert.match(input,/type="text" inputMode="search"/)
  assert.doesNotMatch(input,/type="search"/)
  assert.doesNotMatch(layout,/useNavigationType/)
  assert.doesNotMatch(layout,/navigationType==='POP'/)
  assert.match(layout,/to="\/chats" aria-label="Open general chat"/)
})

test('BentoCards display real account-level Orbit and notification search has a focusable button',()=>{
  const bento=read('src/components/BentoCard.jsx')
  const notifications=read('src/pages/Notifications.jsx')
  assert.match(bento,/useAccountOrbit\(hat\.username\)/)
  assert.match(bento,/Orbit \{accountOrbitScore/)
  assert.match(notifications,/aria-label="Search notifications"/)
  assert.match(notifications,/searchRef\.current\?\.focus\(\)/)
  assert.match(notifications,/<DiscoverySearch ref=\{searchRef\}/)
})

test('admin has liability drilldowns but does not call customer money company profit',()=>{
  const finance=read('api/_lib/financeReporting.js')
  const ui=read('src/components/AdminFinanceLedger.jsx')
  const api=read('api/admin/index.js')
  assert.match(finance,/financeLiabilityAudit/)
  assert.match(finance,/LIABILITY_AUDIT_TYPES/)
  assert.match(finance,/net_profit:null/)
  assert.match(ui,/View liability audit/)
  assert.match(ui,/Net profit: <strong>Not established<\/strong>/)
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
