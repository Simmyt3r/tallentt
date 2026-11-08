import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {Readable} from 'node:stream'
import {testDatabase} from './database.mjs'

let db,pool,review,handler,signSession
const admin=randomUUID(),subscriber=randomUUID(),other=randomUUID()
const originalFetch=global.fetch
const originalPaystackKey=process.env.PAYSTACK_SECRET_KEY
const originalJwt=process.env.JWT_SECRET
const txn=(reference,{userId=subscriber,amount=10000,requested=100,status='success',currency='NGN',legacy=false,escrowId=null}={})=>({
  reference,amount,status,currency,
  metadata:legacy?{escrow_id:escrowId}:{wallet_topup:true,user_id:userId,intended_amount:requested},
})
const makeRef=()=> 'PS_'+randomUUID()
const q=(sql,params)=>pool.query(sql,params)
const verify=tx=>async ref=>{assert.equal(ref,tx.reference);return tx}
async function walletRecord(reference,{userId=subscriber,amount=100,status='success',type='topup'}={}){
  await q(`INSERT INTO wallet_transactions(user_id,type,amount,balance_after,status,reference)
    VALUES($1,$2,$3,1000,$4,$5)`,[userId,type,amount,status,reference])
}
const snapshot=async()=>({
  wallets:(await q('SELECT user_id,balance FROM wallets ORDER BY user_id')).rows,
  journal:(await q('SELECT id,user_id,type,amount,status,reference FROM wallet_transactions ORDER BY id')).rows,
})
before(async()=>{
  process.env.PAYSTACK_SECRET_KEY='sk_test_finance_review_only'
  process.env.JWT_SECRET='finance-review-test'
  db=await testDatabase();pool=db.pool;global.__tworldPool=pool
  await q(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  for(const [uid,username,isAdmin] of [[admin,'finance_admin',true],[subscriber,'finance_client',false],[other,'finance_other',false]]){
    await q(`INSERT INTO users(id,username,full_name,email,password_hash,is_admin)
      VALUES($1,$2,$2,$3,'test',$4)`,[uid,username,username+'@example.test',isAdmin])
    await q('INSERT INTO wallets(user_id,balance) VALUES($1,1000)',[uid])
  }
  review=(await import('../api/_lib/financePaystackReview.js')).financePaystackReferenceReview
  handler=(await import('../api/admin/index.js')).default
  signSession=(await import('../api/_lib/auth.js')).signSession
})
after(async()=>{
  global.fetch=originalFetch
  if(originalPaystackKey===undefined)delete process.env.PAYSTACK_SECRET_KEY
  else process.env.PAYSTACK_SECRET_KEY=originalPaystackKey
  if(originalJwt===undefined)delete process.env.JWT_SECRET
  else process.env.JWT_SECRET=originalJwt
  delete global.__tworldPool
  await db?.close()
})

test('Paystack successful top-up exactly matches one internal subscriber wallet posting, not bank settlement',async()=>{
  const ref=makeRef(),tx=txn(ref)
  await walletRecord(ref)
  const before=await snapshot()
  const result=await review(ref,{q,verify:verify(tx)})
  assert.equal(result.assessment.code,'matched')
  assert.equal(result.assessment.matched,true)
  assert.equal(result.provider.amount_kobo,10000)
  assert.equal(result.wallet_postings.length,1)
  assert.equal(result.wallet_postings[0].username,'finance_client')
  assert.equal(result.bank_settlement.status,'unverified')
  assert.equal(result.bank_settlement.records_checked,false)
  assert.ok(!('customer' in result.provider))
  assert.deepEqual(await snapshot(),before)
})

test('missing provider posting, under-credit, wrong subscriber, and failed provider status require review',async()=>{
  const empty=makeRef()
  assert.equal((await review(empty,{q,verify:verify(txn(empty))})).assessment.code,'verified_payment_missing_wallet_posting')
  const short=makeRef();await walletRecord(short,{amount:99})
  assert.equal((await review(short,{q,verify:verify(txn(short))})).assessment.code,'wallet_provider_mismatch')
  const swapped=makeRef();await walletRecord(swapped,{userId:other})
  assert.equal((await review(swapped,{q,verify:verify(txn(swapped))})).assessment.code,'wallet_provider_mismatch')
  const bad=makeRef();await walletRecord(bad)
  assert.equal((await review(bad,{q,verify:verify(txn(bad,{status:'failed'}))})).assessment.code,'provider_not_successful')
  const payerMissing=makeRef()
  assert.equal((await review(payerMissing,{q,verify:verify(txn(payerMissing,{userId:null}))})).assessment.code,'payment_source_mismatch')
})

test('legacy booking top-up source links to correct escrow owner without treating escrow as revenue',async()=>{
  const ref=makeRef(),escrowId=randomUUID()
  await q(`INSERT INTO escrows(id,client_id,talent_id,amount,payment_reference,status,contacts_unlocked)
    VALUES($1,$2,$3,100,$4,'secured',TRUE)`,[escrowId,subscriber,other,ref])
  await walletRecord('paystack:'+ref,{amount:100})
  const result=await review(ref,{q,verify:verify(txn(ref,{legacy:true,escrowId}))})
  assert.equal(result.assessment.code,'matched')
  assert.equal(result.linked_escrow.id,escrowId)
  assert.equal(result.mode,'legacy_booking')
  assert.equal(result.bank_settlement.status,'unverified')
})

test('invalid reference and provider reference mismatch fail closed before returning journal data',async()=>{
  for(const ref of ['','!'.repeat(12),'x'.repeat(170),'abc']){
    await assert.rejects(review(ref,{q,verify:async()=>{throw new Error('should not call provider')}}),
      err=>err.status===400)
  }
  const reference=makeRef()
  await assert.rejects(review(reference,{q,verify:async()=>txn(makeRef())}),err=>err.status===409)
})

async function http(userId,reference){
  const req=Readable.from([Buffer.from(JSON.stringify({action:'finance_paystack_reference',reference}))])
  Object.assign(req,{method:'POST',url:'/api/admin',headers:{
    host:'localhost',...(userId?{cookie:'cw_session='+signSession({sub:userId})}:{}),
  }})
  const res={headers:{},setHeader(k,v){this.headers[k]=v},end(value){this.body=JSON.parse(value)}}
  await handler(req,res)
  return {status:res.statusCode,body:res.body}
}

test('live Admin API authentication gates provider verification; successful review is read-only',async()=>{
  const ref=makeRef(),tx=txn(ref)
  await walletRecord(ref)
  let calls=0
  global.fetch=async()=>{calls++;return {ok:true,json:async()=>({status:true,data:tx})}}
  assert.equal((await http(null,ref)).status,401)
  assert.equal((await http(subscriber,ref)).status,403)
  assert.equal(calls,0)
  const before=await snapshot()
  const result=await http(admin,ref)
  assert.equal(result.status,200)
  assert.equal(result.body.assessment.code,'matched')
  assert.equal(result.body.bank_settlement.status,'unverified')
  assert.equal(calls,1)
  assert.deepEqual(await snapshot(),before)
})
