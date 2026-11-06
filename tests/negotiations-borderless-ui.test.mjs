import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const page=readFileSync(new URL('../src/pages/Negotiations.jsx',import.meta.url),'utf8')

test('Negotiation Center removes redundant explanation and keeps chat access',()=>{
  assert.doesNotMatch(page,/Price negotiation only\. Completed is negotiation history only\./)
  assert.match(page,/<CompactPageHeader title="Negotiation Center" searchValue=\{search\}/)
  assert.match(page,/inlineSearch searchPlaceholder="Search negotiations…"/)
  assert.match(page,/<Link to="\/messages"[^>]*>[\s\S]*?Deals Chat/)
  assert.match(page,/aria-label="Negotiation status"/)
  assert.match(page,/aria-selected=\{activeTab === tab\}/)
})

test('Negotiation workspace uses flat surfaces without enclosing borders or boxed selections',()=>{
  assert.match(page,/grid gap-3 md:grid-cols-\[minmax\(240px,350px\)_minmax\(0,1fr\)\] md:min-h-\[520px\]/)
  assert.doesNotMatch(page,/md:min-h-\[520px\] rounded-\[20px\] border-\[1\.5px\] border-black/)
  assert.match(page,/className=\{\x60\$\{selected \? 'hidden md:block' : ''\} min-w-0 bg-white\x60\}/)
  assert.doesNotMatch(page,/md:border-r border-black\/10|divide-y divide-black\/10/)
  assert.match(page,/className="space-y-1"/)
  assert.doesNotMatch(page,/border-l-4 border-\[#0A13E6\]/)
  assert.match(page,/selected === item\.id \? 'bg-\[#0A13E6\]\/5'/)
  assert.match(page,/className="min-w-0 space-y-4 bg-white p-3 sm:p-5"/)
  assert.doesNotMatch(page,/rounded-\[16px\] border border-black\/10|rounded-\[14px\] border border-black\/10/)
  assert.match(page,/ct-filter-tabs border-b-0/)
})

test('Removing decorative frames preserves selecting, paging and negotiating',()=>{
  assert.match(page,/onClick=\{\(\) => updateSelection\(item\.id\)\}/)
  assert.match(page,/onClick=\{\(\) => updateSelection\(null, tab\)\}/)
  assert.match(page,/<NegotiationDetail/)
  assert.match(page,/onBack=\{\(\) => updateSelection\(null\)\}/)
  assert.match(page,/api\.getNegotiations\(cursor\)/)
  assert.match(page,/api\.getMessages\(id\)/)
  assert.match(page,/onSubmitOffer=\{submitOffer\}/)
  assert.match(page,/onRespond=\{\(status\) => act\(/)
})
