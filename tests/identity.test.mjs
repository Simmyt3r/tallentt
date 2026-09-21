import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatBusinessName,
  formatClientUsername,
  formatTalentUsername,
  getPrimaryIdentity,
  getProfilePath,
  getSecondaryIdentity,
  identityFromHat,
  getUsernameLabel,
  identityFromRow,
  isBusinessIdentity,
  normalizeUsername,
  resolveIdentity,
} from '../src/lib/profile.js'

const talent = { role: 'talent', fullName: 'Sarverun Simeon Tertese', username: 'simeon' }
const client = { role: 'client', fullName: 'Simeon Laboratories', companySuffix: 'Ltd.', username: 'silabs' }

const noPlaceholders = (value) => assert.doesNotMatch(String(value), /undefined|null/)

test('talent: full name over ^username', () => {
  assert.equal(getPrimaryIdentity(talent), 'Sarverun Simeon Tertese')
  assert.equal(getSecondaryIdentity(talent), '^simeon')
})

test('talent handle never gets a second ^ (or an @)', () => {
  assert.equal(formatTalentUsername('simeon'), '^simeon')
  assert.equal(formatTalentUsername('^simeon'), '^simeon')
  assert.equal(formatTalentUsername('^^simeon'), '^simeon')
  assert.equal(formatTalentUsername('@simeon'), '^simeon')
  assert.equal(getSecondaryIdentity({ ...talent, username: '^simeon' }), '^simeon')
})

test('the username label follows the account kind and never repeats a prefix', () => {
  assert.equal(getUsernameLabel(talent), '^simeon')
  assert.equal(getUsernameLabel({ username: 'bob' }), '^bob') // no name on file: still labelled
  assert.equal(getUsernameLabel(client), 'silabs')
  assert.equal(getUsernameLabel({ role: 'client', username: '^silabs' }), 'silabs')
  assert.equal(getUsernameLabel(undefined), '')
})

test('dual accounts are shown as people (^username), only client is a business', () => {
  assert.equal(isBusinessIdentity('dual'), false)
  assert.equal(getSecondaryIdentity({ ...talent, role: 'dual' }), '^simeon')
  assert.equal(isBusinessIdentity('client'), true)
})

test('client: business name with its stored legal suffix, username without ^', () => {
  assert.equal(getPrimaryIdentity(client), 'Simeon Laboratories Ltd.')
  assert.equal(getSecondaryIdentity(client), 'silabs')
  assert.equal(formatClientUsername('silabs'), 'silabs')
  assert.equal(formatClientUsername('^silabs'), 'silabs')
})

test('client suffix is never duplicated or invented', () => {
  assert.equal(formatBusinessName('Silabs Ltd.', 'Ltd.'), 'Silabs Ltd.')
  assert.equal(formatBusinessName('Silabs Ltd', 'Ltd.'), 'Silabs Ltd')
  assert.equal(formatBusinessName('silabs ltd.', 'Ltd.'), 'silabs ltd.')
  assert.equal(formatBusinessName('Silabs Limited', 'Ltd.'), 'Silabs Limited')
  assert.equal(formatBusinessName('Acme Corporation', 'Corp.'), 'Acme Corporation')
  assert.equal(formatBusinessName('Silabs', ''), 'Silabs')
  assert.equal(formatBusinessName('Silabs', null), 'Silabs')
  // A name that merely ends in the same letters is not a suffix.
  assert.equal(formatBusinessName('Zinc', 'Inc.'), 'Zinc Inc.')
  // Never a lone suffix.
  assert.equal(formatBusinessName('', 'Ltd.'), '')
})

test('fallbacks are safe: never undefined, null or ^undefined', () => {
  assert.equal(getPrimaryIdentity({ role: 'talent', username: 'bob' }), '^bob')
  assert.equal(getSecondaryIdentity({ role: 'talent', username: 'bob' }), '') // would only repeat the main line
  assert.equal(getPrimaryIdentity({ role: 'client', username: 'bobco' }), 'bobco')
  assert.equal(getSecondaryIdentity({ role: 'client', username: 'bobco' }), '')
  assert.equal(getPrimaryIdentity({ role: 'client', fullName: '', companySuffix: 'Ltd.', username: 'bobco' }), 'bobco')
  for (const empty of [undefined, null, {}, '', { username: null, fullName: undefined }, { role: 'client' }]) {
    noPlaceholders(getPrimaryIdentity(empty))
    noPlaceholders(getSecondaryIdentity(empty))
    assert.equal(getPrimaryIdentity(empty), '')
    assert.equal(getSecondaryIdentity(empty), '')
    assert.equal(getProfilePath(empty), null)
  }
  assert.equal(formatTalentUsername(undefined), '')
  assert.equal(formatTalentUsername(null), '')
  assert.equal(formatTalentUsername('   '), '')
  assert.equal(formatTalentUsername('^'), '')
})

test('profile route uses the raw stored username', () => {
  assert.equal(getProfilePath(talent), '/profile/simeon')
  assert.equal(getProfilePath(client), '/profile/silabs')
  assert.equal(getProfilePath('simeon'), '/profile/simeon')
  assert.equal(getProfilePath({ username: 'Si.Labs_1-x' }), '/profile/Si.Labs_1-x') // case and . _ - untouched
  assert.equal(getProfilePath({ username: '^simeon' }), '/profile/simeon') // display sugar is never part of the URL
  assert.equal(getProfilePath({ ...talent, fullName: 'Someone Else Ltd.' }), '/profile/simeon')
})

test('the stored username is never rewritten', () => {
  const stored = { role: 'talent', fullName: 'Sarverun Simeon Tertese', username: 'simeon' }
  getPrimaryIdentity(stored)
  getSecondaryIdentity(stored)
  getProfilePath(stored)
  assert.deepEqual(stored, { role: 'talent', fullName: 'Sarverun Simeon Tertese', username: 'simeon' })
  assert.equal(resolveIdentity(stored).username, 'simeon')
})

test('display text is never used to work out the role', () => {
  // Looks like a business, is a person.
  assert.equal(getSecondaryIdentity({ role: 'talent', fullName: 'Studio Ltd.', username: 'studio' }), '^studio')
  // Has a ^ in it, is a business.
  assert.equal(getSecondaryIdentity({ role: 'client', fullName: 'Studio', username: '^studio' }), 'studio')
  // No role given: person format, regardless of what the strings look like.
  assert.equal(getSecondaryIdentity({ fullName: 'Studio Ltd.', username: 'studio' }), '^studio')
})

test('search input is cleaned back to the raw username', () => {
  assert.equal(normalizeUsername('^simeon'), 'simeon')
  assert.equal(normalizeUsername('  @simeon '), 'simeon')
  assert.equal(normalizeUsername('^^simeon'), 'simeon')
  assert.equal(normalizeUsername('simeon'), 'simeon')
  assert.equal(normalizeUsername('wedding photographer'), 'wedding photographer')
  assert.equal(normalizeUsername('^'), '')
  assert.equal(normalizeUsername(undefined), '')
})

test('API shapes resolve to one identity', () => {
  const fromProfile = resolveIdentity({ fullName: 'A B', username: 'ab', role: 'talent', avatarUrl: 'x.png', companySuffix: null })
  const fromRow = resolveIdentity({ full_name: 'A B', username: 'ab', role: 'talent', avatar_url: 'x.png', company_suffix: null })
  assert.deepEqual(fromProfile, fromRow)

  assert.deepEqual(
    identityFromRow(
      { talent_username: 'simeon', talent_full_name: 'S T', talent_role: 'talent', talent_avatar: 'a.png', client_username: 'nope' },
      'talent',
    ),
    { fullName: 'S T', username: 'simeon', role: 'talent', companySuffix: '', avatarUrl: 'a.png' },
  )
  assert.equal(identityFromRow({ host_avatar_url: 'h.png', host_username: 'h' }, 'host').avatarUrl, 'h.png')
  assert.equal(identityFromRow(null, 'peer').username, '')

  // The owner's account role wins; the hat's own role is only the fallback.
  const dual = identityFromHat({ username: 'simeon', owner_full_name: 'S T', role: 'client', owner_role: 'dual' })
  assert.equal(getSecondaryIdentity(dual), '^simeon')
  const bare = identityFromHat({ username: 'silabs', owner_full_name: 'Silabs', role: 'client', owner_company_suffix: 'Ltd.' })
  assert.equal(getPrimaryIdentity(bare), 'Silabs Ltd.')
  assert.equal(getSecondaryIdentity(bare), 'silabs')
})
