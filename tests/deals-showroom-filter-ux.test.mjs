import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('Deal Details removes the redundant My Deals back-arrow control',()=>{
  const detail=read('src/pages/DealDetails.jsx')
  assert.doesNotMatch(detail,/ArrowLeft/)
  assert.doesNotMatch(detail,/const backUrl|const backTab/)
  assert.doesNotMatch(detail,/<Link to=\{backUrl\}/)
  assert.match(detail,/<h1 className="mb-3 text-\[22px\] font-black">Deal Details<\/h1>/)
  // Keep a recovery link on the error page for genuinely unavailable deals.
  assert.match(detail,/Back to My Deals<\/Link>/)
})

test('My Deals filters match the clean Showroom underline-tab convention',()=>{
  const deals=read('src/pages/MyDeals.jsx')
  const showroom=read('src/components/Showroom.jsx')
  const css=read('src/styles/index.css')
  assert.match(showroom,/className="ct-filter-tabs shrink-0/)
  assert.match(showroom,/className="ct-filter-tab min-h-9/)
  assert.match(css,/\.ct-filter-tab:is\(\[aria-pressed="true"\],/)
  assert.match(deals,/aria-label="Deal role modes" className="ct-filter-tabs min-w-0 gap-3 border-b-0"/)
  assert.match(deals,/aria-label="My Deals view" className="ct-filter-tabs shrink-0 gap-0\.5 border-b-0"/)
  assert.match(deals,/className="ct-filter-tabs mt-4 gap-3 border-b-0 sm:gap-4" aria-label="Deal status filters"/)
  const toolbar=deals.slice(deals.indexOf('className="md:sticky md:top-[134px]'),
    deals.indexOf('aria-label="My Deals display controls"'))
  assert.doesNotMatch(toolbar,/border-b border-black\/10/)
  assert.match(deals,/aria-pressed=\{role===value\}/)
  assert.match(deals,/aria-pressed=\{tab === value\}/)
  assert.match(deals,/aria-pressed=\{viewMode==='grid'\}/)
  assert.match(deals,/aria-pressed=\{viewMode==='list'\}/)
  assert.match(deals,/setView\(role, value\)/)
})

test('Deal detail sections use flat navigation tabs instead of outlined or filled pills',()=>{
  const detail=read('src/pages/DealDetails.jsx')
  assert.match(detail,/aria-label="Deal transaction sections" className="ct-filter-tabs mb-3 gap-3 border-b-0/)
  assert.match(detail,/aria-current=\{detailSection===id\?'page':undefined\}/)
  assert.match(detail,/className="ct-filter-tab min-h-10 px-2 text-\[11px\] sm:text-\[12px\]"/)
  assert.doesNotMatch(detail,/detailSection===id\?'bg-\[#0A13E6\]/)
  for(const label of ['Overview','Agreement','Chat History','Cancel Deal']){
    assert.ok(detail.includes("'"+label+"'"),label+' tab missing')
  }
})
