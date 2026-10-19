import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {testDatabase} from './database.mjs'

let database,pool,financeSummary,financeAudit
const clientId=randomUUID(),talentId=randomUUID(),streamId=randomUUID()
before(async()=>{
 database=await testDatabase();pool=database.pool
 global.__tworldPool=pool
 await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
 const ledger=await import('../api/_lib/financeReporting.js')
 financeSummary=ledger.financeSummary;financeAudit=ledger.financeAudit
 for(const [id,username] of [[clientId,'finance_client'],[talentId,'finance_talent']])
   await pool.query(`INSERT INTO users(id,full_name,username,email,password_hash)
     VALUES($1,$2,$2,$3,'test')`,[id,username,username+'@test.example'])
 await pool.query('INSERT INTO wallets(user_id,balance) VALUES($1,5500),($2,4500)',[clientId,talentId])
 await pool.query(`INSERT INTO escrows(client_id,talent_id,amount,status,
   start_released_amount) VALUES($1,$2,10000,'secured',3000)`,[clientId,talentId])
 await pool.query(`INSERT INTO wallet_transactions(user_id,type,amount,balance_after,status)
   VALUES($1,'withdrawal',900,4600,'pending')`,[clientId])
 await pool.query(`CREATE TABLE IF NOT EXISTS live_support_transactions(
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),stream_id UUID,
   supporter_id UUID,talent_id UUID,gross_amount INT,platform_fee INT,
   net_amount INT,status TEXT,created_at TIMESTAMPTZ DEFAULT NOW())`)
 await pool.query(`INSERT INTO live_support_transactions(stream_id,supporter_id,talent_id,
   gross_amount,platform_fee,net_amount,status) VALUES($1,$2,$3,2000,200,1800,'success')`,
   [streamId,clientId,talentId])
 await pool.query(`INSERT INTO live_support_transactions(stream_id,supporter_id,talent_id,
   gross_amount,platform_fee,net_amount,status) VALUES($1,$2,$3,3000,300,2700,'failed')`,
   [streamId,clientId,talentId])
})
after(async()=>{await database?.close();delete global.__tworldPool})
test('escrow held balance is separate from user wallets and pending withdrawals',async()=>{
 const summary=await financeSummary()
 assert.equal(summary.liabilities.escrow_liability,'7000')
 assert.equal(summary.liabilities.wallet_liability,'10000')
 assert.equal(summary.liabilities.pending_withdrawal_liability,'900')
 assert.equal(summary.liabilities.secured_deals,1)
 assert.equal(summary.recognized_revenue,'200')
 assert.equal(summary.net_profit,null)
 assert.equal(summary.recognized_revenue_partial,true)
 const other=summary.income_streams.find(s=>s.id==='deal_fees')
 assert.equal(other.recorded,false)
 assert.equal(other.inflow,null)
})
test('platform income audit counts only successful, source-linked fees',async()=>{
 const audit=await financeAudit()
 assert.equal(audit.transactions.length,1)
 assert.equal(audit.transactions[0].platform_fee,200)
 assert.equal(audit.transactions[0].gross_amount,2000)
 assert.equal(audit.transactions[0].talent_username,'finance_talent')
 await assert.rejects(financeAudit({stream:'deal_fees'}),/accrual audit/)
 await assert.rejects(financeAudit({cursor:'not-a-uuid'}),/Invalid audit cursor/)
})
