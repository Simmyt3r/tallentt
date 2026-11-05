import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read = path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('Negotiation Center enables single-row title and local search',()=>{
  const page=read('src/pages/Negotiations.jsx')
  assert.match(page,/<CompactPageHeader title="Negotiation Center" searchValue=\{search\} onSearchChange=\{setSearch\}/)
  assert.match(page,/inlineSearch searchPlaceholder="Search negotiations…"/)
  assert.match(page,/searchLabel="Search negotiations by Hat or participant"/)
  assert.match(page,/const searchTerm = search\.trim\(\)\.toLowerCase\(\)/)
  assert.match(page,/category\(item, user\.id\) === activeTab &&/)
})

test('Single-row compact header keeps search beside the title on mobile and desktop',()=>{
  const header=read('src/components/CompactPageHeader.jsx')
  assert.match(header,/inlineSearch = false/)
  assert.match(header,/inlineSearch\s*\? 'flex w-full min-w-0 flex-nowrap items-center justify-between gap-2'/)
  assert.match(header,/inlineSearch\s*\? 'flex min-w-0 shrink-0 items-center gap-2'/)
  assert.match(header,/inlineSearch\s*\? 'whitespace-nowrap text-\[13px\] min-\[360px\]:text-\[15px\] sm:text-\[21px\] md:text-\[23px\]/)
  assert.match(header,/inlineSearch\s*\? 'ml-auto min-w-0 max-w-\[340px\] flex-\[1_1_0%\]'/)
  assert.match(header,/flex w-full flex-wrap items-center justify-between gap-3/)
  assert.match(header,/min-w-\[11rem\] max-w-\[340px\] flex-\[1_1_14rem\]/)
  assert.match(header,/<DiscoverySearch/)
})
