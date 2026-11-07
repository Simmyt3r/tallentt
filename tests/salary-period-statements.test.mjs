import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {testDatabase} from './database.mjs'

let db,pool,monthly,employmentGet
const ids={employer:randomUUID(),talent:randomUUID(),outsider:randomUUID(),agreement:randomUUID()}
const byMonth={}
const schema=async file=>readFile(new URL('../db/'+file,import.meta.url),'utf8')
async function receipt(month,side,amount,{state='paid',debit=true,refund=false,createReceipt=true,payer=null}={}){
  const periodId=byMonth[month],userId=payer||ids[side==='client'?'employer':'talent']
  const reference='monthly-statement:'+month+':'+side
  await pool.query(`INSERT INTO salary_tracking_contributions(period_id,side,payer_id,amount,reference,status,refunded_at)
    VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $6='refunded' THEN NOW() ELSE NULL END)`,
    [periodId,side,userId,amount,reference,state])
  if(createReceipt)await pool.query(`INSERT INTO billing_charge_events
    (user_id,kind,source_id,amount,reference,status,refunded_at)
    VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $6='refunded' THEN NOW() ELSE NULL END)`,
    [userId,side==='client'?'salary_tracking':'salary_tracking_talent',periodId,amount,reference,state==='refunded'?'refunded':'charged'])
  if(debit)await pool.query(`INSERT INTO wallet_transactions
    (user_id,type,amount,balance_after,status,reference) VALUES($1,'billing_charge',$2,9000,'success',$3)`,
    [userId,amount,reference])
  if(refund)await pool.query(`INSERT INTO wallet_transactions
    (user_id,type,amount,balance_after,status,reference) VALUES($1,'billing_refund',$2,10000,'success',$3)`,
    [userId,amount,'refund:'+reference])
}

before(async()=>{
  db=await testDatabase();pool=db.pool;global.__tworldPool=pool
  for(const file of ['schema.sql','patch-employment-2026-10.sql',
    'patch-monetization-2026-10.sql','patch-dual-role-billing-2026-10.sql'])
    await pool.query(await schema(file))
  for(const [role,userId] of [['employer',ids.employer],['talent',ids.talent],['outsider',ids.outsider]]){
    await pool.query(`INSERT INTO users(id,username,full_name,email,password_hash,role)
      VALUES($1,$2,$2,$3,'test',$4)`,[userId,'statement_'+role,role+'@example.test',role==='employer'?'client':'talent'])
    await pool.query('INSERT INTO wallets(user_id,balance) VALUES($1,10000)',[userId])
  }
  const terms={role:'Designer',talent:'Design',start_on:'2026-08-01',salary:100000,
    due_day:25,notice_days:14,work_mode:'Remote'}
  await pool.query(`INSERT INTO employment_agreements
    (id,employer_id,talent_id,status,terms,employer_accepted_at,talent_accepted_at,accepted_version)
    VALUES($1,$2,$3,'active',$4::jsonb,NOW(),NOW(),1)`,
    [ids.agreement,ids.employer,ids.talent,JSON.stringify(terms)])
  for(const [month,status] of [['2026-08','reported'],['2026-09','confirmed'],
    ['2026-10','disputed'],['2026-11','reported']]){
    const {rows}=await pool.query(`INSERT INTO employment_salary_periods
      (agreement_id,month,due_on,paid_on,method,status,confirmed_at,received_on)
      VALUES($1,$2,$3,$4,'bank_transfer',$5,
        CASE WHEN $5='confirmed' THEN NOW() ELSE NULL END,
        CASE WHEN $5='confirmed' THEN $4::date ELSE NULL END) RETURNING id`,
      [ids.agreement,month,month+'-25',month+'-25',status])
    byMonth[month]=rows[0].id
  }
  await receipt('2026-08','client',1000,{createReceipt:false})
  await receipt('2026-09','client',1000)
  await receipt('2026-09','talent',1000)
  await receipt('2026-10','client',500,{state:'refunded',refund:true})
  await receipt('2026-10','talent',500,{state:'refunded',refund:true})
  await receipt('2026-11','client',1000,{refund:true})
  monthly=(await import('../api/_lib/salaryPeriodStatements.js')).salaryPeriodStatements
  employmentGet=(await import('../api/_lib/employment.js')).employmentGet
})
after(async()=>{await db?.close();delete global.__tworldPool})

test('month and role statement distinguishes exact debits, refunds and missing records',async()=>{
  const {byPeriod,available,note}=await monthly(ids.agreement)
  assert.equal(available,true)
  assert.match(note,/not an invoice or independent proof/i)
  const lookup=(month,side)=>byPeriod[byMonth[month]].find(x=>x.side===side)
  assert.equal(lookup('2026-08','client').status,'records_disagree')
  assert.equal(lookup('2026-08','talent').status,'not_paid')
  assert.equal(lookup('2026-09','client').status,'wallet_charge_recorded')
  assert.equal(lookup('2026-09','talent').status,'wallet_charge_recorded')
  assert.equal(lookup('2026-10','client').status,'wallet_refund_recorded')
  assert.equal(lookup('2026-10','talent').status,'wallet_refund_recorded')
  assert.equal(lookup('2026-11','client').status,'refund_review')
  assert.equal(lookup('2026-11','talent').status,'not_paid')
  assert.equal(lookup('2026-10','client').amount,500)
  assert.ok(lookup('2026-09','client').reference.startsWith('monthly-statement:2026-09'))
})

test('both contract participants see the same private record, outsiders cannot read it',async()=>{
  const load=uid=>employmentGet(uid,new URLSearchParams({employment_id:ids.agreement}))
  const employer=await load(ids.employer),talent=await load(ids.talent)
  assert.equal(employer.periods.length,4)
  assert.equal(talent.periods.length,4)
  assert.deepEqual(employer.periods.map(p=>p.trackingStatement),talent.periods.map(p=>p.trackingStatement))
  assert.equal(employer.periods.find(p=>p.month==='2026-09').trackingStatement.entries.length,2)
  await assert.rejects(load(ids.outsider),error=>error.status===404)
})

test('reading statements never edits customer wallets, receipts or the journal',async()=>{
  const beforeWallet=(await pool.query('SELECT user_id,balance FROM wallets ORDER BY user_id')).rows
  const beforeReceipts=(await pool.query('SELECT id,reference,status FROM billing_charge_events ORDER BY id')).rows
  const beforeTransactions=(await pool.query('SELECT id,reference,status FROM wallet_transactions ORDER BY id')).rows
  await monthly(ids.agreement)
  await employmentGet(ids.talent,new URLSearchParams({employment_id:ids.agreement}))
  assert.deepEqual((await pool.query('SELECT user_id,balance FROM wallets ORDER BY user_id')).rows,beforeWallet)
  assert.deepEqual((await pool.query('SELECT id,reference,status FROM billing_charge_events ORDER BY id')).rows,beforeReceipts)
  assert.deepEqual((await pool.query('SELECT id,reference,status FROM wallet_transactions ORDER BY id')).rows,beforeTransactions)
})

test('schema not yet installed returns unavailable, without claiming zero collections',async()=>{
  await pool.query('ALTER TABLE salary_tracking_contributions RENAME TO statements_hidden')
  try{
    const result=await monthly(ids.agreement)
    assert.equal(result.available,false)
    assert.equal(Object.keys(result.byPeriod).length,0)
  }finally{await pool.query('ALTER TABLE statements_hidden RENAME TO salary_tracking_contributions')}
})
