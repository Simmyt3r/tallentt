import test from 'node:test'
import assert from 'node:assert/strict'

const seen = []
global.__tworldPool = {
  query: async (sql, params) => {
    if (sql.includes('COUNT(*)::int AS count FROM notifications'))
      return { rows: [{ count: 4 }] }
    if (sql.includes('SELECT id, type, title, body, link_url')) {
      seen.push({ sql, params })
      return { rows: [{ id: '11111111-1111-4111-8111-111111111111', title: 'Escrow funded', body: 'Deal complete', read_at: null }] }
    }
    throw new Error('Unexpected notification query')
  },
}
const { getNotificationInbox } = await import('../api/_lib/notifications.js')

test('notification search is server-side, user-scoped and paginated', async () => {
  const result = await getNotificationInbox('99999999-9999-4999-8999-999999999999', null, ' Escrow ')
  assert.equal(result.notifications.length, 1)
  assert.equal(result.notifications[0].unread, true)
  assert.equal(result.unreadCount, 4)
  assert.equal(seen[0].params[0], '99999999-9999-4999-8999-999999999999')
  assert.equal(seen[0].params[3], 'Escrow')
  assert.match(seen[0].sql, /user_id = \$1 AND deleted_at IS NULL/)
  assert.match(seen[0].sql, /POSITION\(LOWER\(\$4::text\)/)
  assert.equal(seen[0].params[2], 31)
})

test('search input is length-bound and keeps older-page cursor', async () => {
  const cursor = '22222222-2222-4222-8222-222222222222'
  await getNotificationInbox('99999999-9999-4999-8999-999999999999', cursor, 'x'.repeat(250))
  assert.equal(seen.at(-1).params[1], cursor)
  assert.equal(seen.at(-1).params[3].length, 100)
})

test('invalid inbox cursor is rejected', async () => {
  await assert.rejects(getNotificationInbox('99999999-9999-4999-8999-999999999999', 'not-a-uuid'), /Invalid notification cursor/)
})
