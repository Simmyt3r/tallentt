import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8')
const migration = read('db/patch-associates-2026-10.sql')
const api = read('api/_lib/associates.js')
const escrowHandler = read('api/escrows/index.js')
const inbox = read('src/pages/Inbox.jsx')
const nav = read('src/components/BottomNav.jsx')

test('Associate migration keeps member pairs unique and subscriptions separate',()=>{
  assert.match(migration,/CREATE TABLE IF NOT EXISTS associate_links/)
  assert.match(migration,/CONSTRAINT associate_pair UNIQUE\(member_low,member_high\)/)
  assert.match(migration,/associate_distinct_members/)
  assert.match(migration,/CREATE TABLE IF NOT EXISTS subscriber_follows/)
  assert.match(migration,/subscriber_not_self/)
  assert.doesNotMatch(migration,/ALTER TABLE (?:escrows|booking_messages|wallets)/)
})

test('accepted relationships alone may vouch, blocking removes existing vouches',()=>{
  assert.match(api,/if\(link\.status!=='accepted'\)throw fail\(403,'Only accepted Associates can vouch/)
  assert.match(api,/vouched_by_low=FALSE,vouched_by_high=FALSE/)
  assert.match(api,/who_can_request/)
  assert.match(api,/verified_talents/)
  assert.match(api,/NOW\(\)-INTERVAL '24 hours'/)
})

test('Associate endpoints use existing authenticated escrow handler rather than public writes',()=>{
  assert.match(escrowHandler,/associatesGet\(session\.sub/)
  assert.match(escrowHandler,/associatesAction\(session\.sub/)
  assert.match(escrowHandler,/communityChatsAction\(session\.sub/)
})

test('one Inbox combines conversations while retaining distinct thread handlers',()=>{
  assert.match(inbox,/api.getConversations\(\)/)
  assert.match(inbox,/api.getCommunityChats\(\)/)
  assert.match(inbox,/<BookingThread/)
  assert.match(inbox,/<AssociateThread/)
  assert.doesNotMatch(inbox,/role="tablist"/)
  assert.doesNotMatch(inbox,/booking_messages/)
  assert.doesNotMatch(inbox,/community_messages/)
})

test('bottom nav has three destinations plus Work Pass; Inbox lives in header quick actions',()=>{
  const navs=[...nav.matchAll(/<BottomNavLink\s+to="([^"]+)"/g)].map(x=>x[1])
  assert.deepEqual(navs,['/showroom','/bento','/vibes'])
  assert.match(read('src/components/Layout.jsx'),/aria-label="Open Inbox"/)
  assert.match(nav,/aria-label="Open my Work Pass"/)
  assert.doesNotMatch(nav,/to="\/profile"/)
})

test('legacy chat deep-links preserve original thread identifiers',()=>{
  const app=read('src/App.jsx')
  assert.match(app,/function LegacyInboxRedirect/)
  assert.match(app,/params\.set\('tab', tab\)/)
  assert.match(app,/path="\/messages"/)
  assert.match(app,/path="\/chats"/)
})
