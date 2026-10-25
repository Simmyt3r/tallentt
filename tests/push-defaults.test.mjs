import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// Storage is mocked to verify defaults and preservation of existing opt-outs.
let saved = null
let writes = 0
global.__tworldPool = {
  query: async (sql, args = []) => {
    if (/^\s*(?:CREATE (?:TABLE|INDEX)|ALTER TABLE)/i.test(sql)) return { rows: [], rowCount: 0 }
    if (sql.includes('FROM notification_preferences WHERE user_id = $1')) {
      return { rows: saved ? [saved] : [] }
    }
    if (sql.includes('INSERT INTO notification_preferences')) {
      assert.equal(args.length, 9)
      writes += 1
      saved = Object.fromEntries(['deals','negotiations','messages','payments','live','marketing','associates','vibes_mode']
        .map((key, i) => [key, args[i + 1]]))
      return { rows: [saved] }
    }
    throw new Error('Unexpected query: ' + sql.slice(0, 160))
  },
}

const { getPushPreferences, updatePushPreferences } = await import('../api/_lib/pushNotifications.js')
const id = '22222222-2222-4222-8222-222222222222'
const categories = ['deals','negotiations','messages','payments','associates','live','marketing']

test('new account receives always-on Bento/Money and optional categories selected', async () => {
  saved = null
  const preferences = await getPushPreferences(id)
  assert.deepEqual(Object.keys(preferences), [...categories,'vibes_mode'])
  assert.equal(preferences.vibes_mode,'digest')
  assert.ok(categories.every((category) => preferences[category] === true))
  assert.equal(writes, 0, 'reading defaults should not silently persist user consent')
})

test('unchecking a category persists, and other categories stay checked', async () => {
  saved = null
  const preferences = await updatePushPreferences(id, { marketing: false })
  assert.equal(writes, 1)
  assert.equal(preferences.marketing, false)
  assert.ok(categories.filter((category) => category !== 'marketing').every((category) => preferences[category]))
  assert.equal((await getPushPreferences(id)).marketing, false)
  await updatePushPreferences(id, { deals: false })
  assert.equal((await getPushPreferences(id)).marketing, false)
  assert.equal((await getPushPreferences(id)).deals, true, 'Bento is mandatory under the new notification policy')
})

test('existing subscriber opt-outs are respected by the new defaults', async () => {
  saved = { deals: false, negotiations: true, messages: true,
    payments: true, live: false, marketing: false }
  const preferences = await getPushPreferences(id)
  assert.equal(preferences.deals, true, 'previously muted Bento now delivers required work alerts')
  assert.equal(preferences.live, false)
  assert.equal(preferences.marketing, false)
  assert.equal(preferences.negotiations, true)
})

test('migration changes future defaults without backfilling existing choices', async () => {
  const sql = await readFile(new URL('../db/patch-push-defaults-2026-10.sql', import.meta.url), 'utf8')
  assert.match(sql, /ALTER TABLE IF EXISTS notification_preferences/)
  assert.match(sql, /ALTER COLUMN marketing SET DEFAULT true/)
  assert.doesNotMatch(sql, /\bUPDATE\s+notification_preferences\b/i)
  const client = await readFile(new URL('../src/lib/pushNotifications.js', import.meta.url), 'utf8')
  assert.match(client, /Notification\.requestPermission\(\)/,
    'browser permission must still require a user action')
})
