import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const vibes = readFileSync(new URL('../src/pages/Vibes.jsx', import.meta.url), 'utf8')

test('Vibes create-post placeholder is vertically centered when the composer is empty', () => {
  assert.match(vibes, /<form onSubmit=\{publish\} aria-label="Create a Vibe"/)
  assert.match(vibes, /<textarea id="vibe-text" value=\{text\}/)
  assert.match(vibes, /rows=\{2\} placeholder="Say something…"/)
  assert.match(vibes, /placeholder:text-transparent/)
  assert.match(vibes, /\{!text && \(/)
  assert.match(vibes, /<span aria-hidden="true"/)
  assert.match(vibes, /pointer-events-none absolute inset-y-0 left-3 right-3 flex items-center/)
  assert.match(vibes, /Say something…\s*<\/span>/)
  assert.match(vibes, /className="block w-full min-h-0 resize-y/)
  assert.match(vibes, /onChange=\{e=>setText\(e.target.value\)\}/)
})
