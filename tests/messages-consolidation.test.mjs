import test from 'node:test'
import assert from 'node:assert/strict'
import {consolidateInbox,chatLabel} from '../src/lib/inboxConsolidation.js'
import {readFileSync} from 'node:fs'
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const person='11111111-1111-4111-8111-111111111111'
const other='22222222-2222-4222-8222-222222222222'
const rows=[
  {id:'a',kind:'bento',peer_id:person,peer_username:'one',name:'One User',
    hat_title:'Logo design',last_message:'Deal note',unread_count:2,last_at:'2026-10-30T09:00:00Z'},
  {id:'b',kind:'employment',peer_id:person,peer_username:'one',name:'One User',
    hat_title:'Contract',last_message:'Payroll',unread_count:1,last_at:'2026-10-30T10:00:00Z'},
  {id:'c',kind:'associates',peer_id:person,peer_username:'one',name:'One User',
    last_message:'Hello',unread_count:3,last_at:'2026-10-30T11:00:00Z'},
  {id:'d',kind:'associates',peer_id:other,peer_username:'one',
    name:'One User',last_message:'Another account',unread_count:0,last_at:'2026-10-31T12:00:00Z'},
]
test('same account appears once across all lanes without merging financial records',()=>{
  const grouped=consolidateInbox(rows)
  assert.equal(grouped.length,2)
  const merged=grouped.find(g=>g.peer_id===person)
  assert.equal(merged.threads.length,3)
  assert.equal(merged.unread_count,6)
  assert.equal(merged.last_message,'Hello')
  assert.deepEqual(merged.channels,['Associate chat','Employment','Bento deal'])
  assert.equal(merged.threads[0].id,'c')
  assert.equal(merged.threads[1].id,'b')
  assert.equal(merged.threads[2].id,'a')
  assert.equal(grouped.find(g=>g.peer_id===other).threads.length,1)
  assert.equal(chatLabel(rows[0]),'Bento · Logo design')
})
test('names are not identity; unread totals and optional date fields remain stable',()=>{
  const grouped=consolidateInbox([
    {id:'1',kind:'bento',peer_id:person,name:'Same Name',unread_count:2},
    {id:'2',kind:'bento',peer_id:other,name:'Same Name',unread_count:3},
  ])
  assert.equal(grouped.length,2)
  assert.equal(grouped.reduce((n,g)=>n+g.unread_count,0),5)
  assert.equal(consolidateInbox([]).length,0)
})
test('server list queries include peer IDs, and the inbox never moves actual messages',()=>{
  for(const path of ['api/_lib/communityChats.js','api/_lib/bookingThreads.js','api/_lib/employment.js'])
    assert.match(source(path),/AS peer_id/)
  const inbox=source('src/pages/Inbox.jsx')
  assert.match(inbox,/consolidateInbox\(allThreads/)
  assert.match(inbox,/const latest=item.threads\[0\]/)
  assert.match(inbox,/open\(latest.kind,latest.id\)/)
  assert.doesNotMatch(inbox,/selectedPerson\?\.threads/)
  assert.match(inbox,/initialTab="chat"/)
  assert.doesNotMatch(inbox,/INSERT INTO (?:booking_messages|community_messages|employment_messages)/)
})
test('messages support permission-controlled forwarding while preserving read receipts',()=>{
  const actions=source('src/components/MessageActions.jsx')
  for(const token of ['Copy message','Forward message','Translate message (coming soon)','Read receipt: seen','Read receipt: sent'])
    assert.ok(actions.includes(token),token)
  const forward=source('src/components/ForwardMessageDialog.jsx')
  assert.match(forward,/filter\(t=>t.status==='accepted'\)/)
  assert.match(forward,/action:'community_send'/)
  const api=source('api/_lib/communityChats.js')
  assert.match(api,/if\(thread.status!=='accepted'\)throw fail\(403/)
  assert.match(api,/sender_id<>\$2 AND \(created_at,id\)/)
  for(const ui of ['src/pages/Messages.jsx','src/pages/CommunityChats.jsx','src/pages/Employment.jsx'])
    assert.match(source(ui),/<MessageActions/)
})
