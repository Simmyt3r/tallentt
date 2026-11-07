import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {testDatabase} from './database.mjs'

let db,pool,applyVerifiedTopup
const owner=randomUUID(),other=randomUUID()
const txn=(reference,amount=10000,expected=100,userId=owner)=>({
  reference,status:'success',currency:'NGN',amount,
  metadata:{wallet_topup:true,user_id:userId,intended_amount:expected},
})
const balance=async uid=>Number((await pool.query('SELECT balance FROM wallets WHERE user_id=$1',[uid])).rows[0].balance)
const topups=async()=>Number((await pool.query("SELECT COUNT(*)::int AS n FROM wallet_transactions WHERE type='topup'")).rows[0].n)

before(async()=>{
  db=await testDatabase();pool=db.pool;global.__tworldPool=pool
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  for(const [id,name] of [[owner,'topup_owner'],[other,'topup_other']]){
    await pool.query(`INSERT INTO users(id,username,full_name,email,password_hash)
      VALUES($1,$2,$2,$3,'test')`,[id,name,name+'@example.test'])
    await pool.query('INSERT INTO wallets(user_id,balance) VALUES($1,0)',[id])
  }
  applyVerifiedTopup=(await import('../api/_lib/wallet.js')).applyVerifiedTopup
})
after(async()=>{await db?.close();delete global.__tworldPool})

test('valid Paystack wallet top-up credits intended whole naira exactly once',async()=>{
  const ref='topup:valid:'+randomUUID(),verified=txn(ref,10500,100)
  const first=await applyVerifiedTopup({userId:owner,reference:ref,txn:verified})
  assert.equal(first.alreadyProcessed,false)
  assert.equal(first.amount,100)
  assert.equal(first.paidNaira,105)
  assert.equal(await balance(owner),100)
  assert.equal((await applyVerifiedTopup({userId:owner,reference:ref,txn:verified})).alreadyProcessed,true)
  assert.equal(await balance(owner),100)
  assert.equal(await topups(),1)
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM notifications WHERE type='wallet_topup'")).rows[0].n,1)
})

test('payment amounts must be exact safe integer kobo, never rounded up to meet intended naira',async()=>{
  const starting=await balance(owner),count=await topups()
  for(const [tag,amount,intended] of [
    ['short_9950',9950,100],
    ['short_9999',9999,100],
    ['fraction_amount',10000.5,100],
    ['zero',0,100],
    ['negative',-100,100],
    ['non_numeric',NaN,100],
    ['infinity',Infinity,100],
    ['fraction_intent',10000,100.5],
  ]){
    const ref='topup:'+tag+':'+randomUUID()
    await assert.rejects(applyVerifiedTopup({userId:owner,reference:ref,txn:txn(ref,amount,intended)}),
      err=>err.status===402,tag+' should be rejected')
  }
  assert.equal(await balance(owner),starting)
  assert.equal(await topups(),count)
})

test('Paystack transaction reference, owner, currency and successful status must agree',async()=>{
  const starting=await balance(owner)
  const wrongRef='wrong:'+randomUUID(),correct='correct:'+randomUUID()
  for(const value of [
    txn(wrongRef,10000,100),
    {...txn(correct),currency:'USD'},
    {...txn(correct),currency:undefined},
    {...txn(correct),status:'failed'},
    {...txn(correct),metadata:{wallet_topup:true,intended_amount:100}},
    {...txn(correct),metadata:{wallet_topup:true,user_id:other,intended_amount:100}},
    {...txn(correct),metadata:{wallet_topup:false,user_id:owner,intended_amount:100}},
  ]){
    await assert.rejects(applyVerifiedTopup({userId:owner,reference:correct,txn:value}))
  }
  assert.equal(await balance(owner),starting)
})

test('reference already used by another subscriber or wallet operation never succeeds as a duplicate',async()=>{
  const ref='topup:another:'+randomUUID()
  await applyVerifiedTopup({userId:owner,reference:ref,txn:txn(ref)})
  await assert.rejects(applyVerifiedTopup({userId:other,reference:ref,txn:txn(ref,10000,100,other)}),
    err=>err.status===409)
  const reused='topup:escrow-used:'+randomUUID()
  await pool.query(`INSERT INTO wallet_transactions(user_id,type,amount,balance_after,status,reference)
    VALUES($1,'escrow_fund',100,0,'success',$2)`,[owner,reused])
  await assert.rejects(applyVerifiedTopup({userId:owner,reference:reused,txn:txn(reused)}),
    err=>err.status===409)
  assert.equal(await balance(other),0)
})

test('two concurrent callback/webhook replays yield one wallet credit',async()=>{
  const before=await balance(owner),oldCount=await topups()
  const ref='topup:race:'+randomUUID(),verified=txn(ref,10000,100)
  const results=await Promise.all([
    applyVerifiedTopup({userId:owner,reference:ref,txn:verified}),
    applyVerifiedTopup({userId:owner,reference:ref,txn:verified}),
  ])
  assert.deepEqual(results.map(r=>r.alreadyProcessed).sort(),[false,true])
  assert.equal(await balance(owner),before+100)
  assert.equal(await topups(),oldCount+1)
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM wallet_transactions WHERE reference=$1",[ref])).rows[0].n,1)
})
