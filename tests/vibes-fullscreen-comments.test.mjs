import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('Vibes comments occupy the viewport without repeating the source post',()=>{
  const screen=read('src/pages/VibesConversation.jsx')
  const comments=read('src/components/VibesComments.jsx')
  assert.match(screen,/fixed inset-0 z-\[60\] flex h-\[100dvh\]/)
  assert.match(screen,/aria-label="Vibe conversation page"/)
  assert.doesNotMatch(screen,/\<VibeCard|import \{[^}]*VibeCard/)
  assert.match(screen,/\{post&&<VibesComments post=\{post\} me=\{user\} onDelta=\{onDelta\} fullScreen\/>\}/)
  assert.match(screen,/document\.body\.style\.overflow='hidden'/)
  assert.match(screen,/document\.body\.style\.overflow=oldBody/)
  assert.match(screen,/navigate\(-1\)/)
  assert.match(comments,/fullScreen=false/)
  assert.match(comments,/min-h-0 w-full max-w-\[800px\] flex-1 flex-col overflow-hidden/)
  assert.match(comments,/aria-label="Comments list"/)
  assert.match(comments,/min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain/)
  assert.match(comments,/flex shrink-0 items-start gap-2 border-t border-black\/10 bg-white/)
  assert.match(comments,/paddingBottom:'max\(12px, env\(safe-area-inset-bottom\)\)'/)
  assert.match(comments,/api\.getVibeReplies\(post\.id,before\)/)
  assert.match(comments,/action:'reply',post_id:post\.id/)
})

test('Vibes engagement counts and like/comment/share controls use compact sizes',()=>{
  const feed=read('src/pages/Vibes.jsx')
  assert.match(feed,/aria-label="Vibe engagement counts"[\s\S]{0,200}min-h-8/)
  assert.match(feed,/grid h-4 w-4 place-items-center rounded-full bg-\[#E12754\]/)
  assert.match(feed,/aria-label="Vibe actions" className="grid grid-cols-3 gap-0\.5/)
  assert.match(feed,/min-h-10 items-center justify-center gap-1 rounded-lg text-\[11px\]/)
  assert.match(feed,/<ThumbsUp size=\{15\}/)
  assert.match(feed,/<MessageCircle size=\{15\}/)
  assert.match(feed,/<Share2 size=\{15\}/)
  assert.match(feed,/onClick=\{openComments\}/)
  assert.match(feed,/onClick=\{\(\)=>share\(\)\}/)
})
