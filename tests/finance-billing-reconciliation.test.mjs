import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {testDatabase} from './database.mjs'

let database,pool,financeSummary,financeAudit
const client=randomUUID(),talent=randomUUID()
const receipts={}
const readSql=async name=>readFile(new URL('../db/'+name,import.meta.url),'utf8')

before(async()=>{
  database=await testDatabase()
  pool=database.pool
  global.__tworldPool=pool
  await pool.query(await readSql('schema.sql'))
  await pool.query(await readSql('patch-monetization-2026-10.sql'))
  await pool.query(await readSql('patch-dual-role-billing-2026-10.sql'))
  const reporting=await import('../api/_lib/financeReporting.js')
  financeSummary=reporting.financeSummary
  financeAudit=reporting.financeAudit
  for(const [id,username] of [[client,'finance_billing_client'],[talent,'finance_billing_talent']]){
    await pool.query(`INSERT INTO users(id,username,full_name,email,password_hash)
      VALUES($1,$2,$2,$3,'test')`,[id,username,username+'@test.example'])
    await pool.query('INSERT INTO wallets(user_id,balance) VALUES($1,10000)',[id])
  }
  for(const row of [
    ['client_verified',client,'salary_tracking',1000,'charged',true,false],
    ['talent_verified',talent,'salary_tracking_talent',500,'charged',true,false],
    ['client_unmatched',client,'salary_tracking',200,'charged',false,false],
    ['subscription',client,'subscription',2500,'charged',true,false],
    ['verification_refund',talent,'business_verification',3000,'refunded',true,true],
    ['verification_failed_refund',client,'business_verification',3500,'refunded',true,false],
  ]){
    const [name,userId,kind,amount,status,debit,refund]=row
    const sourceId=randomUUID(),reference='billing-fixture:'+name
    const {rows}=await pool.query(`INSERT INTO billing_charge_events
      (user_id,kind,source_id,amount,reference,status,refunded_at)
      VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $6='refunded' THEN NOW() ELSE NULL END)
      RETURNING id`,[userId,kind,sourceId,amount,reference,status])
    receipts[name]=rows[0].id
    if(debit)await pool.query(`INSERT INTO wallet_transactions
      (user_id,type,amount,balance_after,status,reference)
      VALUES($1,'billing_charge',$2,5000,'success',$3)`,[userId,amount,reference])
    if(refund)await pool.query(`INSERT INTO wallet_transactions
      (user_id,type,amount,balance_after,status,reference)
      VALUES($1,'billing_refund',$2,8000,'success',$3)`,[userId,amount,'refund:'+reference])
  }
})
after(async()=>{await database?.close();delete global.__tworldPool})

test('partial finance totals include only wallet-backed, still-charged source receipts',async()=>{
  const summary=await financeSummary()
  const stream=id=>summary.income_streams.find(s=>s.id===id)
  assert.equal(stream('salary_tracking').inflow,'1000')
  assert.equal(stream('salary_tracking').transactions,1)
  assert.equal(stream('salary_tracking').unmatched_charges,1)
  assert.equal(stream('salary_tracking_talent').inflow,'500')
  assert.equal(stream('subscription').inflow,'2500')
  assert.equal(stream('business_verification').inflow,'0')
  assert.equal(summary.income_totals.pending_recognition,'4000')
  assert.equal(summary.income_totals.recorded_fee_charges,'4000')
  assert.equal(summary.net_profit,null)
  assert.match(summary.warning,/Unmatched charges/i)
})

test('billing audit exposes matched, unmatched and refunded receipts without changing balances',async()=>{
  const beforeRows=(await pool.query('SELECT user_id,balance FROM wallets ORDER BY user_id')).rows
  const clientAudit=await financeAudit({stream:'salary_tracking'})
  assert.equal(clientAudit.recorded,true)
  assert.equal(clientAudit.transactions.length,2)
  const verified=clientAudit.transactions.find(r=>r.id===receipts.client_verified)
  const unverified=clientAudit.transactions.find(r=>r.id===receipts.client_unmatched)
  assert.equal(verified.wallet_evidence,'charged_verified')
  assert.equal(verified.matching_debits,1)
  assert.equal(unverified.wallet_evidence,'charge_unverified')
  assert.equal(unverified.matching_debits,0)
  const refunds=await financeAudit({stream:'business_verification'})
  assert.equal(refunds.transactions.find(r=>r.id===receipts.verification_refund).wallet_evidence,'refunded_verified')
  assert.equal(refunds.transactions.find(r=>r.id===receipts.verification_failed_refund).wallet_evidence,'refund_unverified')
  await assert.rejects(financeAudit({stream:'salary_tracking',cursor:'bad'}),/Invalid audit cursor/)
  await assert.rejects(financeAudit({stream:'unapproved_kind'}),/accrual audit/)
  assert.deepEqual((await pool.query('SELECT user_id,balance FROM wallets ORDER BY user_id')).rows,beforeRows)
})
