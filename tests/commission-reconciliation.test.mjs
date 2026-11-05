import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {Readable} from 'node:stream'
import {testDatabase} from './database.mjs'

let database,pool,ledger,checkout,finance,handler,signSession
const clientId=randomUUID(),talentId=randomUUID(),adminId=randomUUID(),hatId=randomUUID()
let newDeal,oldDeal
before(async()=>{
  database=await testDatabase();pool=database.pool;global.__tworldPool=pool
  process.env.JWT_SECRET='commission-reconciliation-test-secret'
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  for(const [id,name] of [[clientId,'commission_payer'],[talentId,'commission_payee'],[adminId,'commission_owner']]){
    await pool.query(`INSERT INTO users(id,username,full_name,email,password_hash,is_admin)
      VALUES($1,$2,$2,$3,'test',$4)`,[id,name,name+'@test.example',id===adminId])
    await pool.query('INSERT INTO wallets(user_id,balance) VALUES($1,100000)',[id])
  }
  await pool.query(`INSERT INTO hats(id,user_id,username,hat_name,hat_title,category)
    VALUES($1,$2,'commission_payee','Testing','Testing','Testing')`,[hatId,talentId])
  ledger=await import('../api/_lib/commissionLedger.js')
  checkout=await import('../api/_lib/bookingCheckout.js')
  finance=await import('../api/_lib/financeReporting.js')
  handler=(await import('../api/admin/index.js')).default
  signSession=(await import('../api/_lib/auth.js')).signSession
})
after(async()=>{await database?.close();delete global.__tworldPool})
const balance=async id=>(await pool.query('SELECT balance FROM wallets WHERE user_id=$1',[id])).rows[0].balance
async function createDeal(){
  const id=randomUUID()
  await pool.query(`INSERT INTO escrows(id,hat_id,client_id,talent_id,amount,currency,contacts_unlocked)
    VALUES($1,$2,$3,$4,10000,'NGN',TRUE)`,[id,hatId,clientId,talentId])
  return id
}
async function receipt(id,user,type,amount,status='success'){
  const {rows}=await pool.query(`INSERT INTO wallet_transactions(user_id,escrow_id,type,amount,balance_after,status)
    VALUES($1,$2,$3,$4,100000,$5) RETURNING id`,[user,id,type,amount,status])
  return rows[0].id
}
async function snapshot(){
  return JSON.stringify((await pool.query(`SELECT
    (SELECT jsonb_agg(w ORDER BY user_id) FROM wallets w) AS wallets,
    (SELECT jsonb_agg(w ORDER BY id) FROM wallet_transactions w) AS transactions`)).rows)
}
async function reconcileRequest(userId){
  const req=Readable.from([Buffer.from(JSON.stringify({action:'reconcile_commissions'}))])
  Object.assign(req,{method:'POST',url:'/api/admin',headers:{host:'localhost',cookie:userId?'cw_session='+signSession({sub:userId}):''}})
  const res={statusCode:200,setHeader(){},end(body){this.body=JSON.parse(body)}}
  await handler(req,res)
  return res
}

test('a database without billing migrations automatically charges 5% on new funding',async()=>{
  oldDeal=await createDeal()
  await pool.query("UPDATE escrows SET status='released',work_status='completed' WHERE id=$1",[oldDeal])
  await receipt(oldDeal,talentId,'escrow_release',10000)
  newDeal=await createDeal()
  const {getThread}=await import('../api/_lib/bookingThreads.js')
  const preview=(await getThread(clientId,newDeal)).thread
  assert.equal(preview.gig_fee_terms_available,true,'fee disclosure is visible before automatic setup')
  assert.equal(preview.gig_fee_bps,500)
  const [result]=await Promise.all([
    checkout.payBookingWithWallet(clientId,newDeal,10000),ledger.ensureCommissionLedger(),
  ])
  assert.equal(result.checkout.platformFee,500)
  assert.equal(result.escrow.gig_fee_bps,500)
  assert.equal(result.escrow.gig_fee_sealed,true)
  assert.equal(await balance(clientId),90000)
  const {rows}=await pool.query('SELECT stage,fee_amount FROM gig_fee_events WHERE escrow_id=$1',[newDeal])
  assert.deepEqual(rows,[{stage:'sealed',fee_amount:500}])
  const old=(await pool.query('SELECT gig_fee_bps FROM escrows WHERE id=$1',[oldDeal])).rows[0]
  assert.equal(old.gig_fee_bps,null,'earlier payouts are not retroactively charged')
  await assert.rejects(checkout.payBookingWithWallet(clientId,newDeal,10000),error=>error.status===409)
  assert.equal(await balance(clientId),90000)
})

test('reconciliation recovers a missing sealed receipt from its real funding transaction',async()=>{
  await pool.query('DELETE FROM gig_fee_events WHERE escrow_id=$1',[newDeal])
  const before=await snapshot()
  const result=await ledger.reconcileCommissionLedger(adminId)
  assert.deepEqual(result,{recovered_fees:1,recovered_refunds:0})
  assert.equal(await snapshot(),before,'recovering earnings never moves or recharges user money')
  const row=(await finance.financeAudit({stream:'deal_fees'})).transactions.find(row=>row.id===newDeal)
  assert.equal(row.commission_net,'500')
  assert.ok(row.events[0].source_transaction_id)
  assert.ok(row.events[0].reconciled_at)
  assert.deepEqual(await ledger.reconcileCommissionLedger(adminId),{recovered_fees:0,recovered_refunds:0})
})

test('legacy milestone earnings are recovered only when successful payout amounts prove the stored fee',async()=>{
  const legacy=await createDeal()
  await pool.query(`UPDATE escrows SET gig_fee_bps=500,status='released',work_status='completed',
    start_released_amount=3000,work_started_at=NOW() WHERE id=$1`,[legacy])
  const start=await receipt(legacy,talentId,'escrow_start',2850)
  const finish=await receipt(legacy,talentId,'escrow_release',6650)
  const mismatched=await createDeal(),ambiguous=await createDeal(),failed=await createDeal(),wrongPayer=await createDeal(),sealedButPaidInFull=await createDeal()
  for(const id of [mismatched,ambiguous,failed,wrongPayer,sealedButPaidInFull])
    await pool.query("UPDATE escrows SET gig_fee_bps=500,status='released',work_status='completed' WHERE id=$1",[id])
  await receipt(mismatched,talentId,'escrow_release',10000)
  await pool.query('UPDATE escrows SET gig_fee_sealed=TRUE WHERE id=$1',[sealedButPaidInFull])
  await receipt(sealedButPaidInFull,clientId,'escrow_fund',10000)
  await receipt(sealedButPaidInFull,talentId,'escrow_release',10000)
  await pool.query('UPDATE escrows SET gig_fee_sealed=TRUE WHERE id=$1',[ambiguous])
  await receipt(ambiguous,clientId,'escrow_fund',10000)
  await receipt(ambiguous,clientId,'escrow_fund',1)
  await receipt(failed,talentId,'escrow_release',9500,'failed')
  await receipt(wrongPayer,clientId,'escrow_release',9500)
  const before=await snapshot()
  assert.deepEqual(await ledger.reconcileCommissionLedger(adminId),{recovered_fees:2,recovered_refunds:0})
  assert.equal(await snapshot(),before)
  const rows=(await finance.financeAudit({stream:'deal_fees'})).transactions
  const recovered=rows.find(row=>row.id===legacy)
  assert.equal(recovered.commission_net,'500')
  assert.deepEqual(new Set(recovered.events.map(event=>event.source_transaction_id)),new Set([start,finish]))
  for(const id of [mismatched,ambiguous,failed,wrongPayer,sealedButPaidInFull]){
    assert.equal(rows.find(row=>row.id===id).events.length,0)
    assert.equal(rows.find(row=>row.id===id).commission_status,'unverified')
  }
  const old=rows.find(row=>row.id===oldDeal)
  assert.equal(old.commission_net,'0')
  assert.equal(old.commission_status,'not_collected')
})

test('recovering a missing partial-refund adjustment preserves only earned commission',async()=>{
  const refunded=await createDeal()
  await pool.query(`UPDATE escrows SET gig_fee_bps=500,gig_fee_sealed=TRUE,status='refunded',work_status='refunded',
    start_released_amount=3000,work_started_at=NOW() WHERE id=$1`,[refunded])
  await receipt(refunded,clientId,'escrow_fund',10000)
  await receipt(refunded,talentId,'escrow_start',2850)
  const refundId=await receipt(refunded,clientId,'refund',7000)
  const before=await snapshot()
  assert.deepEqual(await ledger.reconcileCommissionLedger(adminId),{recovered_fees:1,recovered_refunds:1})
  assert.equal(await snapshot(),before)
  const row=(await finance.financeAudit({stream:'deal_fees'})).transactions.find(row=>row.id===refunded)
  assert.equal(row.commission_gross,'500')
  assert.equal(row.commission_reversed,'350')
  assert.equal(row.commission_net,'150')
  assert.equal(row.refund_transaction_id,refundId)
  const results=await Promise.all([ledger.reconcileCommissionLedger(adminId),ledger.reconcileCommissionLedger(adminId)])
  assert.ok(results.every(result=>result.recovered_fees===0&&result.recovered_refunds===0))
  assert.equal((await finance.financeSummary()).deal_commissions.net,'1150')
})

test('only admins can reconcile historical commission receipts',async()=>{
  assert.equal((await reconcileRequest(null)).statusCode,401)
  assert.equal((await reconcileRequest(clientId)).statusCode,403)
  assert.equal((await reconcileRequest(adminId)).statusCode,200)
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM admin_audit_logs WHERE action='reconcile_commissions'")).rows[0].n,3)
})

test('commission storage errors stop checkout before any money can move',async()=>{
  const id=await createDeal(),before=await snapshot(),originalQuery=pool.query
  pool.query=async function(sql,...args){
    if(sql.includes("to_regclass('gig_fee_events')"))throw new Error('commission storage unavailable')
    return originalQuery.call(this,sql,...args)
  }
  try{await assert.rejects(checkout.payBookingWithWallet(clientId,id,10000),/commission storage unavailable/)}
  finally{pool.query=originalQuery}
  assert.equal(await snapshot(),before)
  assert.equal((await pool.query('SELECT status FROM escrows WHERE id=$1',[id])).rows[0].status,'not_funded')
})

test('a failed commission receipt insert rolls back funding and the wallet debit together',{timeout:30000},async()=>{
  const id=await createDeal(),before=await snapshot(),originalConnect=pool.connect
  pool.connect=function(callback){
    // pg.Pool.query uses connect(callback); service transactions use the promise
    // form. Preserve both signatures and do not mutate the pooled client.
    if(typeof callback==='function')return originalConnect.call(this,callback)
    return originalConnect.call(this).then(client=>({
      query:(sql,...args)=>sql.includes('INSERT INTO gig_fee_events')
        ?Promise.reject(new Error('receipt insert failed')):client.query(sql,...args),
      release:()=>client.release(),
    }))
  }
  try{await assert.rejects(checkout.payBookingWithWallet(clientId,id,10000),/receipt insert failed/)}
  finally{pool.connect=originalConnect}
  assert.equal(await snapshot(),before)
  assert.equal((await pool.query('SELECT status FROM escrows WHERE id=$1',[id])).rows[0].status,'not_funded')
})


test('automatic setup remains compatible with the full billing migrations',async()=>{
  for(const file of ['patch-employment-2026-10.sql','patch-monetization-2026-10.sql','patch-dual-role-billing-2026-10.sql'])
    await pool.query(await readFile(new URL('../db/'+file,import.meta.url),'utf8'))
  await ledger.ensureCommissionLedger()
  assert.equal((await finance.financeSummary()).deal_commissions.net,'1150')
})
