import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {testDatabase} from './database.mjs'

let db,pool,billing,gigs,ids={}
const money=async id=>(await pool.query('SELECT balance FROM wallets WHERE user_id=$1',[id])).rows[0]?.balance||0
before(async()=>{
  db=await testDatabase();pool=db.pool;global.__tworldPool=pool
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  const patch=await readFile(new URL('../db/patch-monetization-2026-10.sql',import.meta.url),'utf8')
  await pool.query(patch);await pool.query(patch)
  for(const [name,role] of [['client','client'],['second','client'],['talent','talent'],['admin','dual']]){
    ids[name]=randomUUID()
    await pool.query("INSERT INTO users(id,username,full_name,email,password_hash,role,is_admin) VALUES($1,$2,$2,$3,'x',$4,$5)",
      [ids[name],name,name+'@example.test',role,name==='admin'])
    await pool.query('INSERT INTO wallets(user_id,balance) VALUES($1,30000)',[ids[name]])
  }
  billing=await import('../api/_lib/billing.js')
  gigs=await import('../api/_lib/gigFees.js')
})
after(async()=>{await db?.close();delete global.__tworldPool})

test('the admin patch is idempotent and leaves old deals with no retroactive fee terms',async()=>{
  const {rows}=await pool.query("SELECT to_regclass('gig_fee_events') AS fees,to_regclass('billing_charge_events') AS billing")
  assert.ok(rows[0].fees)
  assert.ok(rows[0].billing)
  const {rows:columns}=await pool.query("SELECT column_default FROM information_schema.columns WHERE table_name='escrows' AND column_name='gig_fee_bps'")
  assert.equal(columns[0].column_default,null)
})
test('unpriced paid plans are not purchasable, free membership stays free',async()=>{
  const catalog=await billing.billingOverview(ids.talent)
  assert.equal(catalog.talentPlans[0].available,true)
  assert.equal(catalog.talentPlans[1].amountNaira,null)
  const request={audience:'talent',plan:'green_pro',expected_amount:3000,request_id:randomUUID()}
  await assert.rejects(billing.buySubscription(ids.talent,request),e=>e.status===409)
  assert.equal(await money(ids.talent),30000)
})
test('Admin prices subscriptions and wallet debits only once per request ID',async()=>{
  await billing.adminPlanPrice(ids.admin,{audience:'talent',plan:'green_pro',amount:3000,enabled:true})
  const request={audience:'talent',plan:'green_pro',expected_amount:3000,request_id:randomUUID()}
  await assert.rejects(billing.buySubscription(ids.client,request),e=>e.status===403)
  await assert.rejects(billing.buySubscription(ids.talent,{...request,expected_amount:1000}),e=>e.status===409)
  const purchase=await billing.buySubscription(ids.talent,request)
  assert.equal(purchase.amount,3000)
  assert.equal(await money(ids.talent),27000)
  assert.equal((await billing.buySubscription(ids.talent,request)).alreadyProcessed,true)
  assert.equal(await money(ids.talent),27000)
  const status=await billing.billingOverview(ids.talent)
  assert.equal(status.subscriptions[0].plan_code,'green_pro')
})
test('₦3,000 business verification is manual and rejects refund in the same transaction',async()=>{
  await assert.rejects(billing.requestBusinessVerification(ids.talent,{
    request_id:randomUUID(),legal_name:'Valid Venture Ltd',registration_number:'RC-123456',
  }),e=>e.status===403)
  const request={request_id:randomUUID(),legal_name:'Valid Venture Ltd',registration_number:'RC-123456'}
  const b=await billing.requestBusinessVerification(ids.client,request)
  assert.equal(b.status,'pending')
  assert.equal(await money(ids.client),27000)
  assert.equal((await billing.requestBusinessVerification(ids.client,request)).alreadyProcessed,true)
  assert.equal((await billing.billingOverview(ids.client)).isBusinessVerified,false)
  await assert.rejects(billing.requestBusinessVerification(ids.client,{...request,request_id:randomUUID()}),e=>e.status===409)
  const reviewed=await billing.adminReviewBusiness(ids.admin,{request_id:b.id,decision:'rejected',note:'CAC record not matched'})
  assert.equal(reviewed.refunded,true)
  assert.equal(await money(ids.client),30000)
  assert.equal((await billing.billingOverview(ids.client)).verification.status,'rejected')
  await assert.rejects(billing.adminReviewBusiness(ids.admin,{request_id:b.id,decision:'approved'}),e=>e.status===409)
  const v=await billing.requestBusinessVerification(ids.client,{...request,request_id:randomUUID()})
  await billing.adminReviewBusiness(ids.admin,{request_id:v.id,decision:'approved',note:'Registration confirmed'})
  assert.equal((await billing.billingOverview(ids.client)).isBusinessVerified,true)
})
test('gig platform accrual recognizes only released gross; refund remainder is untouched',async()=>{
  const hat=randomUUID(),escrow=randomUUID()
  await pool.query("INSERT INTO hats(id,user_id,username,hat_name,hat_title,category) VALUES($1,$2,'talent','Tester','Tester','Test')",[hat,ids.talent])
  await pool.query(`INSERT INTO escrows(id,hat_id,client_id,talent_id,amount,gig_fee_bps)
    VALUES($1,$2,$3,$4,50000,500)`,[escrow,hat,ids.client,ids.talent])
  const client=await pool.connect()
  try{
    await client.query('BEGIN')
    const terms={id:escrow,amount:50000,gig_fee_bps:500}
    const start=await gigs.bookGigRelease(client,terms,{stage:'start',gross:15000,previousGross:0})
    const final=await gigs.bookGigRelease(client,terms,{stage:'completion',gross:35000,previousGross:15000})
    assert.equal(start.fee,750);assert.equal(start.net,14250)
    assert.equal(final.fee,1750);assert.equal(final.net,33250)
    await client.query('COMMIT')
  }catch(err){await client.query('ROLLBACK').catch(()=>{});throw err}finally{client.release()}
  const {rows}=await pool.query("SELECT SUM(fee_amount)::int AS fees,COUNT(*)::int AS count FROM gig_fee_events WHERE escrow_id=$1",[escrow])
  assert.equal(rows[0].fees,2500)
  assert.equal(rows[0].count,2)
})
