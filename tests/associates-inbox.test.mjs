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

test('one Inbox exposes two separate conversation components',()=>{
  assert.match(inbox,/Bento Chat/)
  assert.match(inbox,/Associates Chat/)
  assert.match(inbox,/<Messages embedded/)
  assert.match(inbox,/<CommunityChats embedded/)
  assert.doesNotMatch(inbox,/booking_messages/)
  assert.doesNotMatch(inbox,/community_messages/)
})

test('bottom nav has precisely five destinations with one Inbox and no Associates icon',()=>{
  const navs=[...nav.matchAll(/<BottomNavLink\s+to="([^"]+)"/g)].map(x=>x[1])
  assert.deepEqual(navs,['/showroom','/bento','/vibes','/inbox','/profile'])
})

test('legacy chat deep-links preserve original thread identifiers',()=>{
  const app=read('src/App.jsx')
  assert.match(app,/function LegacyInboxRedirect/)
  assert.match(app,/params\.set\('tab', tab\)/)
  assert.match(app,/path="\/messages"/)
  assert.match(app,/path="\/chats"/)
})
