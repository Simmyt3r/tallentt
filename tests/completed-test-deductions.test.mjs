import test,{before,beforeEach,after} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {testDatabase} from './database.mjs'

let database,pool,finance
const script=await readFile(new URL('../db/patch-test-completed-commissions-2026-11.sql',import.meta.url),'utf8')
const software='85d022a2-6b94-45ef-8d87-8055492e3d2d',music='8739fa2c-4270-4715-9ee8-0ba1844de275'
const clientId=randomUUID(),developerId=randomUUID(),musicianId=randomUUID(),hat=randomUUID(),other=randomUUID()
before(async()=>{
  database=await testDatabase();pool=database.pool;global.__tworldPool=pool
  for(const file of ['schema.sql','patch-monetization-2026-10.sql'])
    await pool.query(await readFile(new URL('../db/'+file,import.meta.url),'utf8'))
  await (await import('../api/_lib/commissionLedger.js')).ensureCommissionLedger()
  finance=await import('../api/_lib/financeReporting.js')
})
after(async()=>{await database?.close();delete global.__tworldPool})
beforeEach(async()=>{
  await pool.query('TRUNCATE users CASCADE')
  for(const [id,name] of [[clientId,'test_client'],[developerId,'test_developer'],[musicianId,'test_musician']])
    await pool.query(`INSERT INTO users(id,username,full_name,email,password_hash) VALUES($1,$2,$2,$3,'test')`,[id,name,name+'@example.test'])
  await pool.query('INSERT INTO wallets(user_id,balance) VALUES($1,560500),($2,158000),($3,50000)',[developerId,musicianId,clientId])
  await pool.query(`INSERT INTO hats(id,user_id,username,hat_name,hat_title,category)
    VALUES($1,$2,'test_developer','Test','Test','Test')`,[hat,developerId])
  for(const [id,talent,amount,start] of [[software,developerId,500000,150000],[music,musicianId,58000,17400],[other,developerId,35000,10500]]){
    await pool.query(`INSERT INTO escrows(id,hat_id,client_id,talent_id,amount,currency,status,work_status,start_released_amount,work_started_at)
      VALUES($1,$2,$3,$4,$5,'NGN','released','completed',$6,NOW())`,[id,hat,clientId,talent,amount,start])
    for(const [user,type,value] of [[clientId,'escrow_fund',amount],[talent,'escrow_start',start],[talent,'escrow_release',amount-start]])
      await pool.query(`INSERT INTO wallet_transactions(user_id,escrow_id,type,amount,balance_after,status)
        VALUES($1,$2,$3,$4,100000,'success')`,[user,id,type,value])
  }
})
const balance=async id=>(await pool.query('SELECT balance FROM wallets WHERE user_id=$1',[id])).rows[0].balance
async function run(){
  const client=await pool.connect()
  try{await client.query(script)}
  catch(error){await client.query('ROLLBACK');throw error}
  finally{client.release()}
}

test('the reviewed completed test deals deduct exactly ₦27,900, with matching receipts and earnings',async()=>{
  await run()
  assert.equal(await balance(developerId),535500)
  assert.equal(await balance(musicianId),155100)
  assert.equal(await balance(clientId),50000)
  const {rows}=await pool.query(`SELECT escrow_id,fee_amount,balance_before,balance_after FROM test_completed_commission_deductions ORDER BY fee_amount DESC`)
  assert.deepEqual(rows,[{escrow_id:software,fee_amount:25000,balance_before:560500,balance_after:535500},
    {escrow_id:music,fee_amount:2900,balance_before:158000,balance_after:155100}])
  const summary=await finance.financeSummary()
  assert.equal(summary.deal_commissions.net,'27900')
  assert.equal(summary.recognized_revenue,'27900')
  const {rows:wallet}=await pool.query("SELECT amount,escrow_id FROM wallet_transactions WHERE type='billing_charge' ORDER BY amount DESC")
  assert.deepEqual(wallet,[{amount:25000,escrow_id:software},{amount:2900,escrow_id:music}])
  const audit=await finance.financeAudit({stream:'deal_fees'})
  assert.equal(audit.transactions.find(row=>row.id===software).events[0].origin,'historical_test')
  assert.ok(audit.transactions.find(row=>row.id===music).events[0].source_transaction_id)
  assert.equal(audit.transactions.find(row=>row.id===other).commission_net,'0','unreviewed deals remain unchanged')
})
test('running the deductions twice cannot debit wallets or count income twice',async()=>{
  await run();await run()
  assert.equal(await balance(developerId),535500)
  assert.equal(await balance(musicianId),155100)
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM wallet_transactions WHERE type='billing_charge'")).rows[0].n,2)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM gig_fee_events')).rows[0].n,2)
  assert.equal((await finance.financeSummary()).deal_commissions.net,'27900')
})
test('insufficient balance rolls back every deduction, including an earlier successful debit in the batch',async()=>{
  await pool.query('UPDATE wallets SET balance=1000 WHERE user_id=$1',[musicianId])
  await assert.rejects(run(),/Insufficient test wallet balance/)
  assert.equal(await balance(developerId),560500)
  assert.equal(await balance(musicianId),1000)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM gig_fee_events')).rows[0].n,0)
})
test('an unfinished deal or mismatched payout refuses the entire batch',async()=>{
  await pool.query("UPDATE escrows SET status='secured',work_status='in_progress' WHERE id=$1",[music])
  await assert.rejects(run(),/Reviewed test deal changed/)
  assert.equal(await balance(developerId),560500)
  await pool.query("UPDATE escrows SET status='released',work_status='completed' WHERE id=$1",[music])
  await pool.query("UPDATE wallet_transactions SET amount=40000 WHERE escrow_id=$1 AND type='escrow_release'",[music])
  await assert.rejects(run(),/Full fee-free test payout/)
  assert.equal(await balance(developerId),560500)
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM wallet_transactions WHERE type='billing_charge'")).rows[0].n,0)
})
