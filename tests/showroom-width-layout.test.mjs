import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('Showroom route bypasses the shared max-width and side gutters only for Showroom',()=>{
  const layout=read('src/components/Layout.jsx')
  assert.match(layout,/const isShowroom = location\.pathname === '\/showroom' \|\| location\.pathname\.startsWith\('\/showroom\/'\)/)
  assert.match(layout,/className=\{isShowroom\s*\? 'w-full min-w-0 px-0/)
  assert.match(layout,/: 'w-full min-w-0 max-w-\[1600px\] mx-auto px-4 md:px-6 lg:px-8/)
  assert.match(layout,/md:pl-\[72px\]/)
  assert.match(layout,/md:pl-\[236px\]/)
})

test('Showroom screen, header and media posts fill available width',()=>{
  const show=read('src/components/Showroom.jsx')
  const post=read('src/components/ShowroomPost.jsx')
  const css=read('src/styles/index.css')
  assert.match(show,/sr-showroom-screen relative w-full min-w-0/)
  assert.match(show,/className="sticky z-30 isolate w-full min-w-0 shrink-0 px-4/)
  assert.doesNotMatch(show,/shrink-0 -mx-4 md:-mx-6 lg:-mx-8/)
  assert.match(show,/ref=\{scrollRegionRef\} className="sr-feed-viewport"/)
  assert.match(post,/sr-post w-full min-w-0 flex flex-col overflow-hidden rounded-none md:rounded-\[18px\]/)
  assert.match(css,/\.sr-showroom-screen \{[\s\S]*?width: 100%;[\s\S]*?min-width: 0;/)
  assert.match(css,/\.sr-feed-viewport \{[\s\S]*?width: 100%;/)
  assert.match(css,/scroll-snap-type: y mandatory/)
})
