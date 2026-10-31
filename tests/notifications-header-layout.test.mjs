import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const page=read('src/pages/Notifications.jsx')

test('notifications title, search trigger, and bulk actions share one header row',()=>{
  assert.match(page,/<header className="sticky top-14 md:top-16[^\n]*?>/)
  assert.match(page,/<div className="flex min-w-0 items-center justify-between gap-2">/)
  assert.match(page,/<h1[^>]*>Notifications<\/h1>/)
  const header=page.slice(page.indexOf('<header className="sticky'),page.indexOf('</header>'))
  assert.match(header,/aria-label=\{searchOpen\?'Close notifications search':'Search notifications'\}/)
  assert.match(header,/aria-label="More notification actions"/)
  assert.match(header,/\{searchOpen&&<div id="notification-search"/)
  assert.doesNotMatch(page,/CompactPageHeader/)
})

test('three-dot menu has mark all read and irreversible clear all, with escape and outside dismissal',()=>{
  assert.match(page,/<MoreVertical size=\{21\}\/>/)
  assert.match(page,/role="menu" aria-label="Notification actions"/)
  assert.match(page,/<CheckCheck size=\{17\}\/> Mark all read/)
  assert.match(page,/<Trash2 size=\{16\}\/> Clear all/)
  assert.match(page,/role="menuitem" disabled=\{!unreadCount\}/)
  assert.match(page,/role="menuitem" disabled=\{loading\}/)
  assert.match(page,/document.addEventListener\('pointerdown',outside\)/)
  assert.match(page,/document.addEventListener\('keydown',keydown\)/)
  assert.match(page,/if\(event.key==='Escape'\)/)
  assert.match(page,/window.confirm\('Clear your entire notification inbox/)
  assert.match(page,/await api.clearNotifications\(\)/)
  assert.match(page,/await api.markAllNotificationsRead\(\)/)
})

test('five notification lanes stay on a single horizontally scrollable row, with unread indicators',()=>{
  assert.match(page,/role="tablist" aria-label="Notification categories"/)
  assert.match(page,/flex w-full min-w-0 flex-nowrap items-center gap-2 overflow-x-auto/)
  assert.match(page,/whitespace-nowrap/)
  assert.match(page,/min-h-11 shrink-0 items-center/)
  assert.match(page,/aria-selected=\{currentLane===id\}/)
  assert.match(page,/setParams\(\{lane:id\}\)/)
  assert.match(page,/unreadByLane\[id\]/)
  assert.doesNotMatch(page,/grid grid-cols-3 gap-1\.5 sm:grid-cols-5/)
})

test('search uses existing server-side debounce and filters without moving its trigger below title',()=>{
  assert.match(page,/setTimeout\(\(\) => setSearchTerm\(search.trim\(\)\), 250\)/)
  assert.match(page,/api.getNotifications\(null, searchTerm,currentLane\)/)
  assert.match(page,/api.getNotifications\(nextCursor, searchTerm,currentLane\)/)
  assert.match(page,/aria-label="Search selected notification category"/)
  assert.match(page,/onChange=\{event=>setSearch\(event.target.value\)\}/)
  assert.match(page,/aria-label="Clear notification search"/)
})
