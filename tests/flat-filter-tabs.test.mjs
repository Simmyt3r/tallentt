import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('shared filters match the flat underlined My Profile style', () => {
  const css = read('src/styles/index.css')
  assert.match(css, /\.ct-filter-tabs\s*\{/)
  assert.match(css, /\.ct-filter-tab\s*\{/)
  assert.match(css, /\.ct-filter-tab:is\(\[aria-pressed="true"\], \[aria-selected="true"\], \[aria-current="page"\]\)/)
  assert.match(css, /border-0 border-b-2 border-transparent bg-transparent/)
  assert.match(css, /focus-visible:outline/)
  assert.match(css, /\.ct-filter-select\s*\{/)
  assert.match(css, /border-radius: 0/)
})

test('all app-wide list filters use shared borderless tabs and preserve state', () => {
  const cases = [
    ['src/pages/MyDeals.jsx', /aria-pressed=\{tab === value\}/],
    ['src/pages/Negotiations.jsx', /aria-selected=\{activeTab === tab\}/],
    ['src/pages/DisputeCenter.jsx', /aria-pressed=\{filter === status\}/],
    ['src/pages/Notifications.jsx', /aria-selected=\{currentLane===id\}/],
    ['src/pages/Inbox.jsx', /aria-pressed=\{filter === key\}/],
    ['src/components/Showroom.jsx', /aria-pressed=\{view === value\}/],
    ['src/components/profile/ProfileView.jsx', /aria-pressed=\{selectedTalent === name\}/],
    ['src/pages/Settings.jsx', /aria-pressed=\{section===id\}/],
    ['src/components/AdminOrbitAndHatReview.jsx', /aria-pressed=\{tab==='reviews'\}/],
    ['src/pages/Admin.jsx', /aria-current=\{active \? 'page' : undefined\}/],
    ['src/components/MyHats.jsx', /aria-pressed=\{viewMode === 'grid'\}/],
  ]
  for (const [path, statePattern] of cases) {
    const source = read(path)
    assert.match(source, /ct-filter-tab/, path + ' should use the shared flat tab style')
    assert.match(source, statePattern, path + ' must preserve its selected state')
  }
  assert.match(read('src/components/Showroom.jsx'), /className="ct-filter-select max-w-\[160px\]/)
  assert.match(read('src/pages/Admin.jsx'), /className="ct-filter-select h-12 w-full/)
})

test('search, transaction and navigation functionality is retained', () => {
  assert.match(read('src/pages/MyDeals.jsx'), /onClick=\{\(\) => setView\(role, value\)\}/)
  assert.match(read('src/components/Showroom.jsx'), /onChange=\{\(event\) => setCategory\(event.target.value\)\}/)
  assert.match(read('src/pages/Notifications.jsx'), /onClick=\{\(\)=>setParams\(\{lane:id\}\)\}/)
  assert.match(read('src/pages/Inbox.jsx'), /onClick=\{\(\) => setFilter\(key\)\}/)
  assert.match(read('src/components/profile/ProfileView.jsx'), /function SectionNav/)
})
