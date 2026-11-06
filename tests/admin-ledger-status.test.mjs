import test from 'node:test'
import assert from 'node:assert/strict'
import { testDatabase } from './database.mjs'
import { WALLET_CREDIT_TYPES } from '../shared/walletTransaction.js'
import { workStatusForDeal, DEAL_WORK_STATUS_SQL } from '../shared/dealWorkStatus.js'

test('wallet receipts, refunds and earnings are credits; outgoing money stays a debit', () => {
  const credits = new Set(WALLET_CREDIT_TYPES)
  for (const type of ['wallet_transfer_received', 'topup', 'escrow_start', 'escrow_release', 'refund', 'billing_refund', 'live_support_earning']) {
    assert.equal(credits.has(type), true, type)
  }
  for (const type of ['wallet_transfer_sent', 'escrow_fund', 'withdrawal', 'billing_charge', 'live_support_sent']) {
    assert.equal(credits.has(type), false, type)
  }
})

test('admin rows and aggregate reports classify unfunded and closed deals by escrow state', async () => {
  const database = await testDatabase()
  try {
    const { rows } = await database.pool.query(`SELECT *, ${DEAL_WORK_STATUS_SQL} AS projected
      FROM (VALUES
        ('not_funded', 'in_progress', 60000),
        ('secured', 'in_progress', 250000),
        ('cancelled', 'in_progress', 10000),
        ('released', 'in_progress', 500000),
        ('refunded', 'disputed', 20000)
      ) AS escrows(status,work_status,amount)`)
    for (const row of rows) assert.equal(row.projected, workStatusForDeal(row))
    const grouped = await database.pool.query(`SELECT ${DEAL_WORK_STATUS_SQL} AS status,
      COUNT(*)::int AS count, SUM(amount)::int AS amount
      FROM (VALUES ('not_funded','in_progress',60000),('secured','in_progress',250000))
        AS escrows(status,work_status,amount) GROUP BY 1 ORDER BY 1`)
    assert.deepEqual(grouped.rows, [
      { status: 'awaiting_funding', count: 1, amount: 60000 },
      { status: 'in_progress', count: 1, amount: 250000 },
    ])
  } finally { await database.close() }
})
