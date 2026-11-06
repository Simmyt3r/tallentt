import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fullOrbitScore } from '../src/lib/profileScore.js'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('full profile Orbit value preserves uncapped non-negative activity points', () => {
  assert.equal(fullOrbitScore(0), 0)
  assert.equal(fullOrbitScore(72), 72)
  assert.equal(fullOrbitScore('88'), 88)
  assert.equal(fullOrbitScore(100), 100)
  assert.equal(fullOrbitScore(101), 101)
  assert.equal(fullOrbitScore(-1), 0)
  assert.equal(fullOrbitScore(null), null)
  assert.equal(fullOrbitScore(undefined), null)
  assert.equal(fullOrbitScore(''), null)
  assert.equal(fullOrbitScore('invalid'), null)
  assert.equal(fullOrbitScore(123456), 123456)
})

test('own profile displays the full score on the same row as Edit Profile', () => {
  const header = read('src/components/profile/ProfileHeader.jsx')
  assert.match(header, /const orbitScore = fullOrbitScore\(orbit\?\.score\)/)
  assert.match(header, /\{isOwner \? \(\s*<div className="mt-4 flex min-w-0 items-center justify-between gap-2"/)
  assert.match(header, /aria-label="Profile actions and Orbit score"/)
  assert.match(header, /Orbit Score: <strong[^>]*>\{orbitScore !== null \?/)
  assert.doesNotMatch(header, /out of 100|single-digit scale|\/100/)
  assert.match(header, /<button type="button" onClick=\{onEditClick\}/)
  assert.match(header, /shrink-0 px-3 text-\[11px\] sm:px-4/)
  assert.match(header, /'Orbit score unavailable'/)
  assert.match(header, /View Opportunities/)
  assert.match(header, /View Hats/)
})

test('profile Score & ranking uses the same full score separately from ratings', () => {
  const scorePanel = read('src/components/profile/ProfileScore.jsx')
  assert.match(scorePanel, /const fullScore = fullOrbitScore\(orbit\?\.score\)/)
  assert.match(scorePanel, /Orbit Score \{fullScore !== null \?/)
  assert.match(scorePanel, /Orbit activity points have no upper limit/)
  assert.doesNotMatch(scorePanel, /0–9|\/100/)
})
