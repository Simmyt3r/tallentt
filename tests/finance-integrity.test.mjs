import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {testDatabase} from './database.mjs'

let database,pool,financeIntegritySnapshot,adminHandler,signSession
const adminId=randomUUID(),memberId=randomUUID()
const sql=async file=>readFile(new URL('../db/'+file,import.meta.url),'utf8')
const request=async(userId)=>{
  const req={method:'GET',url:'/api/admin?action=finance_integrity',
    headers:{host:'localhost',cookie:userId?'cw_session='+signSession({sub:userId}):''}}
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},
    end(body){this.body=JSON.parse(body)}}
  await adminHandler(req,res)
  return res
}

before(async()=>{
  database=await testDatabase()
  pool=database.pool
  global.__tworldPool=pool
  process.env.JWT_SECRET='finance-integrity-test-secret'
  for(const file of ['schema.sql','patch-monetization-2026-10.sql','patch-dual-role-billing-2026-10.sql'])
    await pool.query(await sql(file))
  for(const [id,name,isAdmin] of [[adminId,'integrity_admin',true],[memberId,'integrity_member',false]]){
    await pool.query(`INSERT INTO users(id,username,full_name,email,password_hash,is_admin)
      VALUES($1,$2,$2,$3,'test',$4)`,[id,name,name+'@test.example',isAdmin])
    await pool.query('INSERT INTO wallets(user_id,balance) VALUES($1,10000)',[id])
  }
  const cases=[
    ['matched','salary_tracking',1000,'charged',true,false],
    ['unmatched','salary_tracking_talent',500,'charged',false,false],
    ['refunded','business_verification',3000,'refunded',true,true],
    ['missing_refund','subscription',2000,'refunded',true,false],
    ['unexpected_refund','subscription',1500,'charged',true,true],
  ]
  for(const [name,kind,amount,status,charge,refund] of cases){
    const reference='integrity:'+name
    await pool.query(`INSERT INTO billing_charge_events
      (user_id,kind,source_id,amount,reference,status,refunded_at)
      VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $6='refunded' THEN NOW() ELSE NULL END)`,
      [memberId,kind,randomUUID(),amount,reference,status])
    if(charge)await pool.query(`INSERT INTO wallet_transactions
      (user_id,type,amount,balance_after,status,reference)
      VALUES($1,'billing_charge',$2,9000,'success',$3)`,[memberId,amount,reference])
    if(refund)await pool.query(`INSERT INTO wallet_transactions
      (user_id,type,amount,balance_after,status,reference)
      VALUES($1,'billing_refund',$2,10000,'success',$3)`,[memberId,amount,'refund:'+reference])
  }
  await pool.query(`INSERT INTO wallet_transactions
    (user_id,type,amount,balance_after,status,reference)
    VALUES($1,'billing_charge',800,9000,'success','integrity:orphan-charge'),
      ($1,'billing_refund',900,10000,'success','refund:integrity:orphan-refund')`,[memberId])
  financeIntegritySnapshot=(await import('../api/_lib/financeIntegrity.js')).financeIntegritySnapshot
  adminHandler=(await import('../api/admin/index.js')).default
  signSession=(await import('../api/_lib/auth.js')).signSession
})
after(async()=>{await database?.close();delete global.__tworldPool})

test('read-only exception snapshot shows both journal legs without booking false revenue',async()=>{
  const beforeState=(await pool.query('SELECT user_id,balance FROM wallets ORDER BY user_id')).rows
  const beforeJournal=(await pool.query('SELECT COUNT(*)::int AS n FROM wallet_transactions')).rows[0].n
  const beforeReceipts=(await pool.query('SELECT COUNT(*)::int AS n FROM billing_charge_events')).rows[0].n
  const report=await financeIntegritySnapshot()
  assert.equal(report.recorded,true)
  assert.equal(report.total_exceptions,5)
  assert.equal(report.sample.length,5)
  assert.equal(report.sample_limited,false)
  assert.equal(report.gateway_settlement.status,'unverified')
  assert.equal(report.gateway_settlement.records_checked,false)
  const counts=Object.fromEntries(report.counts.map(row=>[row.issue,row.count]))
  assert.deepEqual(counts,{
    charge_unverified:1,refund_unverified:1,unexpected_refund:1,
    orphan_wallet_charge:1,orphan_wallet_refund:1,
  })
  assert.ok(report.sample.every(x=>x.username==='integrity_member'))
  assert.deepEqual((await pool.query('SELECT user_id,balance FROM wallets ORDER BY user_id')).rows,beforeState)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM wallet_transactions')).rows[0].n,beforeJournal)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM billing_charge_events')).rows[0].n,beforeReceipts)
})

test('admin integrity endpoint is private, read-only and fails closed for members',async()=>{
  assert.equal((await request(null)).statusCode,401)
  assert.equal((await request(memberId)).statusCode,403)
  const admin=await request(adminId)
  assert.equal(admin.statusCode,200)
  assert.equal(admin.headers['Cache-Control'],'private, no-store')
  assert.equal(admin.body.total_exceptions,5)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM admin_audit_logs')).rows[0].n,0)
})

test('missing optional billing migration returns unavailable, not zero verified exceptions',async()=>{
  await pool.query('ALTER TABLE billing_charge_events RENAME TO hidden_charge_events')
  try{
    const report=await financeIntegritySnapshot()
    assert.equal(report.recorded,false)
    assert.equal(report.gateway_settlement.status,'unverified')
    assert.match(report.note,/not installed/i)
  }finally{
    await pool.query('ALTER TABLE hidden_charge_events RENAME TO billing_charge_events')
  }
})
