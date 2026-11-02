import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fullOrbitScore, singleDigitOrbit } from '../src/lib/profileScore.js'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('full profile Orbit value preserves the canonical 0–100 scale', () => {
  assert.equal(fullOrbitScore(0), 0)
  assert.equal(fullOrbitScore(72), 72)
  assert.equal(fullOrbitScore('88'), 88)
  assert.equal(fullOrbitScore(100), 100)
  assert.equal(fullOrbitScore(101), 100)
  assert.equal(fullOrbitScore(-1), 0)
  assert.equal(fullOrbitScore(null), null)
  assert.equal(fullOrbitScore(undefined), null)
  assert.equal(fullOrbitScore(''), null)
  assert.equal(fullOrbitScore('invalid'), null)
  // Other app surfaces can continue using the 0–9 display scale.
  assert.equal(singleDigitOrbit(72), 6)
})

test('own profile displays the full score on the same row as Edit Profile', () => {
  const header = read('src/components/profile/ProfileHeader.jsx')
  assert.match(header, /const orbitScore = fullOrbitScore\(orbit\?\.score\)/)
  assert.match(header, /\{isOwner \? \(\s*<div className="mt-4 flex min-w-0 items-center justify-between gap-2"/)
  assert.match(header, /aria-label="Profile actions and Orbit score"/)
  assert.match(header, /Orbit Score: <strong[^>]*>\{orbitScore !== null \?/)
  assert.match(header, /\`\$\{orbitScore\}\/100\`/)
  assert.match(header, /<button type="button" onClick=\{onEditClick\}/)
  assert.match(header, /shrink-0 px-3 text-\[11px\] sm:px-4/)
  assert.match(header, /'Orbit score unavailable'/)
  assert.match(header, /View Opportunities/)
  assert.match(header, /View Hats/)
})

test('profile Score & ranking uses the same full score without changing rating logic', () => {
  const scorePanel = read('src/components/profile/ProfileScore.jsx')
  assert.match(scorePanel, /const fullScore = fullOrbitScore\(orbit\?\.score\)/)
  assert.match(scorePanel, /Orbit Score \{fullScore !== null \?/)
  assert.match(scorePanel, /Orbit \(0–9 display scale\) × rating:/)
  assert.match(scorePanel, /\(digit \* Number\(rating\)\)\.toFixed\(1\)/)
})
