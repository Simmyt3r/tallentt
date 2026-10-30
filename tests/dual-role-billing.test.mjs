import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {testDatabase} from './database.mjs'
let db,pool,services,ids={}
const balance=async id=>Number((await pool.query('SELECT balance FROM wallets WHERE user_id=$1',[id])).rows[0].balance)
before(async()=>{
  db=await testDatabase();pool=db.pool;global.__tworldPool=pool
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  for(const file of ['patch-employment-2026-10.sql','patch-monetization-2026-10.sql','patch-dual-role-billing-2026-10.sql']){
    const sql=await readFile(new URL('../db/'+file,import.meta.url),'utf8')
    await pool.query(sql);await pool.query(sql)
  }
  for(const [name,role] of [['employer','client'],['talent','talent'],['admin','dual']]){
    ids[name]=randomUUID()
    await pool.query(`INSERT INTO users(id,username,full_name,email,password_hash,role,is_admin)
      VALUES($1,$2,$3,$4,'test',$5,$6)`,[ids[name],name,name,name+'@example.test',role,name==='admin'])
    await pool.query('INSERT INTO wallets(user_id,balance) VALUES($1,30000)',[ids[name]])
  }
  services=await import('../api/_lib/salaryTrackingFees.js')
})
after(async()=>{await db?.close();delete global.__tworldPool})

test('Admin monthly fees start fixed, escrow stays unpriced and each change is audited',async()=>{
  const prices=await services.salaryTrackingPrices()
  assert.equal(prices.bank_transfer,1000)
  assert.equal(prices.cash,500)
  assert.equal(prices.escrow,null)
  assert.deepEqual(services.fixedSalaryQuote(prices,'bank_transfer'),{
    currency:'NGN',method:'bank_transfer',eachParty:1000,combined:2000,feeType:'fixed_monthly',
  })
  assert.throws(()=>services.fixedSalaryQuote(prices,'escrow'),/Admin has not set/)
  await services.adminSalaryPrice(ids.admin,{method:'escrow',fee_naira:750})
  assert.equal((await services.salaryTrackingPrices()).escrow,750)
  const {rows:audits}=await pool.query("SELECT COUNT(*)::int AS n FROM admin_audit_logs WHERE action='salary_tracking_price'")
  assert.equal(audits[0].n,1)
})
test('Both roles pay once monthly; verified salary evidence requires confirmed salary and both fees',async()=>{
  const agreement=randomUUID(),period=randomUUID()
  ids.agreement=agreement;ids.period=period
  const terms={salary:75000,currency:'NGN',role:'Technician',talent:'Repairs',start_on:'2026-01-01',due_day:25}
  await pool.query(`INSERT INTO employment_agreements(id,employer_id,talent_id,status,terms,
    employer_accepted_at,talent_accepted_at,accepted_version)
    VALUES($1,$2,$3,'active',$4::jsonb,NOW(),NOW(),1)`,[agreement,ids.employer,ids.talent,JSON.stringify(terms)])
  await pool.query(`INSERT INTO employment_salary_periods(id,agreement_id,month,due_on,paid_on,method,status)
    VALUES($1,$2,'2026-10','2026-10-25','2026-10-25','bank_transfer','reported')`,[period,agreement])
  const client=await pool.connect()
  try{
    await client.query('BEGIN')
    await services.collectTrackingSide(client,{periodId:period,side:'client',payerId:ids.employer,fee:1000})
    await client.query('COMMIT')
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}
  assert.equal(await balance(ids.employer),29000)
  assert.deepEqual(await services.trackingPeriodsPaid(undefined,ids.employer),{talent:0,client:0})
  await pool.query(`UPDATE employment_salary_periods SET status='confirmed',confirmed_at=NOW(),received_on='2026-10-25'
    WHERE id=$1`,[period])
  assert.deepEqual(await services.trackingPeriodsPaid(undefined,ids.talent),{talent:0,client:0})
  const client2=await pool.connect()
  try{
    await client2.query('BEGIN')
    await services.collectTrackingSide(client2,{periodId:period,side:'talent',payerId:ids.talent,fee:1000})
    await client2.query('COMMIT')
  }catch(e){await client2.query('ROLLBACK').catch(()=>{});throw e}finally{client2.release()}
  assert.equal(await balance(ids.talent),29000)
  assert.deepEqual(await services.trackingPeriodsPaid(undefined,ids.talent),{talent:1,client:0})
  assert.deepEqual(await services.trackingPeriodsPaid(undefined,ids.employer),{talent:0,client:1})
  const duplicate=await pool.connect()
  try{
    await duplicate.query('BEGIN')
    await assert.rejects(services.collectTrackingSide(duplicate,{periodId:period,side:'talent',payerId:ids.talent,fee:1000}),/already paid/)
    await duplicate.query('ROLLBACK')
  }finally{duplicate.release()}
})
test('Disputed salary reverses both tracking debits and removes Work Pass eligibility',async()=>{
  const client=await pool.connect()
  try{
    await client.query('BEGIN')
    assert.equal(await services.refundTrackingSides(client,ids.period),2)
    await client.query("UPDATE employment_salary_periods SET status='disputed',confirmed_at=NULL,received_on=NULL WHERE id=$1",[ids.period])
    await client.query('COMMIT')
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}
  assert.equal(await balance(ids.employer),30000)
  assert.equal(await balance(ids.talent),30000)
  assert.deepEqual(await services.trackingPeriodsPaid(undefined,ids.talent),{talent:0,client:0})
  const {rows}=await pool.query("SELECT COUNT(*)::int AS n FROM billing_charge_events WHERE status='refunded'")
  assert.equal(rows[0].n,2)
})
test('One account has distinct Talent/Client Orbit factors and no cross-role point transfers',async()=>{
  const {calculateOrbitScore}=await import('../api/_lib/accountOrbit.js')
  const base={completedProfileFields:5,verifiedIdentity:true,completedWork:5,
    successfulHires:0,activeDays:10,accountAgeDays:365}
  const result=calculateOrbitScore(base)
  assert.equal(result.byRole.talent.score,100)
  assert.ok(result.byRole.client.score<result.byRole.talent.score)
  assert.ok(!result.byRole.talent.factors.some(f=>f.key==='successful_hires'))
  assert.ok(!result.byRole.client.factors.some(f=>f.key==='completed_work'))
})
