import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('Inbox conversation filters have no enclosing borders and retain flat active tabs',()=>{
  const inbox=read('src/pages/Inbox.jsx')
  const css=read('src/styles/index.css')
  assert.match(inbox,/className="ct-filter-tabs mx-4 flex-nowrap gap-3 border-b-0 py-2"/)
  assert.match(inbox,/aria-label="Filter conversations"/)
  assert.match(inbox,/aria-pressed=\{filter === key\}/)
  assert.match(inbox,/className="ct-filter-tab text-\[11px\]"/)
  assert.match(css,/\.ct-filter-tab:is\(\[aria-pressed="true"\], \[aria-selected="true"\], \[aria-current="page"\]\)/)
})

test('Open-chat subscriber channel filters use Showroom flat tabs, not pill outlines or filled pills',()=>{
  const inbox=read('src/pages/Inbox.jsx')
  const nav=inbox.slice(inbox.indexOf('aria-label="Chats with this subscriber"'),
    inbox.indexOf('{hiring ? <NewEmployment'))
  assert.match(nav,/className="ct-filter-tabs shrink-0 gap-3 border-b-0/)
  assert.match(nav,/className="ct-filter-tab min-h-10 px-2 text-\[11px\]"/)
  assert.match(nav,/aria-current=\{\(entry.kind==='bento'/)
  assert.match(nav,/onClick=\{\(\)=>open\(entry.kind,entry.id\)\}/)
  assert.match(nav,/\{chatLabel\(entry\)\}/)
  assert.doesNotMatch(nav,/border-b border-black\/10|border-\[|rounded-full|bg-\[#0A13E6\] text-white/)
})
