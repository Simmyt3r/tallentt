import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { testDatabase } from './database.mjs'

test('Bento/inbox migration is repeatable and private deletion preserves deal records', async () => {
  const db = await testDatabase()
  global.__tworldPool = db.pool
  try {
    const pool = db.pool
    await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'))
    const patch = await readFile(new URL('../db/patch-bento-inbox-2026-10.sql', import.meta.url), 'utf8')
    const clientId = randomUUID(), talentId = randomUUID(), outsiderId = randomUUID()
    const hatId = randomUUID(), escrowId = randomUUID()
    for (const [id, username] of [[clientId,'client_a'],[talentId,'talent_a'],[outsiderId,'stranger']]) {
      await pool.query(
        `INSERT INTO users (id,full_name,username,email,password_hash,role)
        VALUES ($1,$2,$2,$3,'test','dual')`,
        [id, username, username + '@example.test'],
      )
    }
    await pool.query(
      `INSERT INTO hats (id,user_id,username,hat_title,hat_name,category,role)
       VALUES ($1,$2,'talent_a','Photographer','Photography','Arts','talent')`,
      [hatId,talentId],
    )
    await pool.query(
      `INSERT INTO escrows (id,hat_id,client_id,talent_id,amount)
       VALUES ($1,$2,$3,$4,5000)`,
      [escrowId,hatId,clientId,talentId],
    )
    const noticeA = randomUUID(), noticeB = randomUUID()
    for(const [id,user] of [[noticeA,clientId],[noticeB,talentId]]) {
      await pool.query(
        `INSERT INTO notifications(id,user_id,type,title) VALUES($1,$2,'system','New update')`,
        [id,user],
      )
    }
    await pool.query(patch)
    await pool.query(patch)
    const notices = await import('../api/_lib/notifications.js')
    assert.equal((await notices.getNotificationInbox(clientId)).notifications.length, 1)
    assert.equal(await notices.deleteNotification(outsiderId,noticeA), false)
    assert.equal((await notices.getNotificationInbox(clientId)).unreadCount, 1)
    assert.equal(await notices.deleteNotification(clientId,noticeA), true)
    assert.equal((await notices.getNotificationInbox(clientId)).notifications.length, 0)
    assert.equal((await notices.getNotificationInbox(talentId)).notifications.length, 1)
    assert.equal((await notices.clearNotifications(talentId)), 1)
    assert.equal((await notices.getNotificationInbox(talentId)).unreadCount, 0)
    const preserved = await pool.query('SELECT COUNT(*)::int AS n FROM notifications')
    assert.equal(preserved.rows[0].n, 2, 'soft deletion must preserve audit rows')

    const threads = await import('../api/_lib/bookingThreads.js')
    assert.equal((await threads.getConversations(clientId)).conversations.length, 1)
    await assert.rejects(threads.hideConversation(outsiderId,escrowId), /not found/i)
    assert.deepEqual(await threads.hideConversation(clientId,escrowId), { hidden:true })
    assert.equal((await threads.getConversations(clientId)).conversations.length, 0)
    assert.equal((await threads.getConversations(talentId)).conversations.length, 1)
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM escrows')).rows[0].n, 1)
    await pool.query(`UPDATE escrows SET messages_updated_at=NOW()+INTERVAL '3 seconds' WHERE id=$1`, [escrowId])
    assert.equal((await threads.getConversations(clientId)).conversations.length, 1,
      'a new message must restore the hidden chat to the inbox')
  } finally {
    delete global.__tworldPool
    await db.close()
  }
})
