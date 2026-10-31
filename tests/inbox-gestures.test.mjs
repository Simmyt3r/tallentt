import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')

test('Inbox is reachable from the header, but absent from mobile and desktop navigation',()=>{
  assert.match(read('src/components/Layout.jsx'),/to="\/inbox"[\s\S]*?aria-label="Open Inbox"/)
  assert.doesNotMatch(read('src/components/BottomNav.jsx'),/to="\/inbox"/)
  assert.doesNotMatch(read('src/lib/nav.js'),/to: '\/inbox'/)
})

test('one tap opens the latest real chat instead of a person conversation selector',()=>{
  const inbox=read('src/pages/Inbox.jsx')
  assert.match(inbox,/item.threads\[0\]/)
  assert.match(inbox,/open\(latest.kind,latest.id\)/)
  assert.doesNotMatch(inbox,/selectedPerson\?\.threads/)
  assert.match(inbox,/initialTab=\{params.get\("view"\)/)
  assert.doesNotMatch(inbox,/>Hire full-time</)
  assert.doesNotMatch(inbox,/rounded-3xl border border-black\/10 bg-white shadow-sm/)
  assert.match(inbox,/Search conversations/)
})

test('chat list removal is a hold or swipe action with confirmation, not a permanent inline delete button',()=>{
  const row=read('src/components/InboxConversationRow.jsx')
  const inbox=read('src/pages/Inbox.jsx')
  assert.match(row,/setTimeout\(\(\)=>\{suppress.current=true;setActions\(true\)/)
  assert.match(row,/Math.abs\(dx\)>65/)
  assert.match(row,/onContextMenu/)
  assert.match(row,/onRemove\(item\)/)
  assert.match(inbox,/window.confirm/)
  assert.match(inbox,/api.hideInboxThread/)
  assert.match(inbox,/api.hideConversation/)
})

test('message actions require hold, right click or keyboard context key; receipts remain visible',()=>{
  const actions=read('src/components/MessageActions.jsx')
  assert.match(actions,/onPointerDown=\{pointerDown\}/)
  assert.match(actions,/onContextMenu/)
  assert.match(actions,/shiftKey&&e.key==='F10'/)
  assert.match(actions,/\{menu&&<div role="menu"/)
  assert.match(actions,/Read receipt: seen/)
  for(const path of ['src/pages/Messages.jsx','src/pages/CommunityChats.jsx','src/pages/Employment.jsx']){
    const source=read(path)
    assert.match(source,/<MessageActions[\s\S]*?>[\s\S]*?<\/MessageActions>/)
    assert.doesNotMatch(source,/Replying to \{reply.sender_id/)
  }
})

test('cross-lane removal authenticates ownership and keeps all records, while new chat activity revives the list entry',()=>{
  const sql=read('db/patch-inbox-hidden-threads-2026-10.sql')
  const backend=read('api/_lib/inboxHidden.js')
  const community=read('api/_lib/communityChats.js')
  const employment=read('api/_lib/employment.js')
  assert.match(sql,/PRIMARY KEY\(user_id,kind,thread_id\)/)
  assert.match(backend,/t.initiator_id=\$1 OR t.recipient_id=\$1/)
  assert.match(backend,/t.employer_id=\$1/)
  assert.match(backend,/inboxHiddenEnabled/)
  assert.match(community,/t.updated_at<=hidden.hidden_at/)
  assert.match(community,/\$\{hideFilter\}/)
  assert.match(employment,/a.updated_at<=hidden.hidden_at/)
  assert.match(employment,/\$\{hideFilter\}/)
  assert.doesNotMatch(backend,/DELETE FROM community_messages|DELETE FROM employment_messages/)
})
