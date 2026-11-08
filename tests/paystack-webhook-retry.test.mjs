import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID,createHmac} from 'node:crypto'
import {Readable} from 'node:stream'
import {readFile} from 'node:fs/promises'
import {testDatabase} from './database.mjs'

const userId=randomUUID()
const oldFetch=global.fetch
const oldSecret=process.env.PAYSTACK_SECRET_KEY
const oldWebhookSecret=process.env.PAYSTACK_WEBHOOK_SECRET
let db,pool,handler,verifySigned,providerCalls=0
const webhookSecret='whsec_chombutar_test_only_not_real'
const legacySecret='sk_test_chombutar_fake'
const balance=async()=>Number((await pool.query('SELECT balance FROM wallets WHERE user_id=$1',[userId])).rows[0].balance)
const credits=async()=>Number((await pool.query("SELECT COUNT(*)::int AS n FROM wallet_transactions WHERE type='topup'")).rows[0].n)
const txn=(reference,overrides={})=>({
  reference,status:'success',amount:10000,currency:'NGN',
  metadata:{wallet_topup:true,user_id:userId,intended_amount:100},...overrides,
})
const payload=ref=>({
  event:'charge.success',data:{reference:ref,metadata:{wallet_topup:true,user_id:userId}},
})
function signed(raw,{modern=true,expired=false,legacyToo=false,wrong=false}={}){
  const timestamp=Math.floor(Date.now()/1000)-(expired?400:0)
  const rawBuffer=Buffer.isBuffer(raw)?raw:Buffer.from(raw)
  const hmac=createHmac('sha512',webhookSecret).update(String(timestamp)+'.').update(rawBuffer).digest('hex')
  const current='t='+timestamp+',v1=whk_old:'+('0'.repeat(128))+',v1=whk_current:'+(wrong?'f'.repeat(128):hmac)
  const legacy=createHmac('sha512',legacySecret).update(rawBuffer).digest('hex')
  return modern?{'paystack-signature':current,...(legacyToo?{'x-paystack-signature':legacy}:{})}
    :{'x-paystack-signature':legacy}
}
async function post(data,config={},overrides={}){
  const raw=Buffer.isBuffer(data)?data:Buffer.from(JSON.stringify(data))
  const req=Readable.from([raw])
  Object.assign(req,{method:'POST',url:'/api/escrows',headers:{
    host:'localhost',...signed(raw,config),...overrides,
  }})
  const response={headers:{},setHeader(key,value){this.headers[key.toLowerCase()]=value},
    end(value){this.body=JSON.parse(value)}}
  await handler(req,response)
  return {status:response.statusCode,body:response.body,headers:response.headers}
}
const providerSuccess=(reference,overrides={})=>{
  global.fetch=async()=>{providerCalls++;return {ok:true,json:async()=>({
    status:true,data:txn(reference,overrides),
  })}}
}
before(async()=>{
  process.env.PAYSTACK_SECRET_KEY=legacySecret
  process.env.PAYSTACK_WEBHOOK_SECRET=webhookSecret
  db=await testDatabase();pool=db.pool;global.__tworldPool=pool
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  await pool.query(`INSERT INTO users(id,username,full_name,email,password_hash)
    VALUES($1,'webhook_test_user','Webhook Test','webhook@example.test','test')`,[userId])
  await pool.query('INSERT INTO wallets(user_id,balance) VALUES($1,0)',[userId])
  handler=(await import('../api/escrows/index.js')).default
  verifySigned=(await import('../api/_lib/paystack.js')).verifyPaystackSignedWebhook
})
after(async()=>{
  global.fetch=oldFetch
  if(oldSecret===undefined)delete process.env.PAYSTACK_SECRET_KEY
  else process.env.PAYSTACK_SECRET_KEY=oldSecret
  if(oldWebhookSecret===undefined)delete process.env.PAYSTACK_WEBHOOK_SECRET
  else process.env.PAYSTACK_WEBHOOK_SECRET=oldWebhookSecret
  delete global.__tworldPool
  await db?.close()
})

test('current rotating Paystack signatures work, and exact webhook replay credits only once',async()=>{
  const reference='webhook_new_'+randomUUID()
  providerSuccess(reference)
  const start=await balance(),oldCredits=await credits()
  const first=await post(payload(reference))
  assert.equal(first.status,200)
  assert.equal(first.body.processed,true)
  assert.equal(await balance(),start+100)
  const again=await post(payload(reference))
  assert.equal(again.status,200)
  assert.equal(again.body.processed,true)
  assert.equal(await balance(),start+100)
  assert.equal(await credits(),oldCredits+1)
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM wallet_transactions WHERE reference=$1",[reference])).rows[0].n,1)
})

test('invalid modern header never falls back to a valid legacy signature; expired, tampered and unsigned are rejected',async()=>{
  const reference='webhook_bad_'+randomUUID(),body=payload(reference),raw=Buffer.from(JSON.stringify(body))
  const beforeCalls=providerCalls
  assert.equal((await post(body,{wrong:true,legacyToo:true})).status,401)
  assert.equal((await post(body,{expired:true})).status,401)
  const tampered=Buffer.from(JSON.stringify({...body,data:{...body.data,reference:'changed'}}))
  assert.equal(verifySigned(tampered,{
    newSignature:signed(raw)['paystack-signature'],
    legacySignature:signed(tampered,{modern:false})['x-paystack-signature'],
  }),false)
  assert.equal((await post(body,{}, {'paystack-signature':'t=9999999999,v1=whk_fake:'+('a'.repeat(128))})).status,401)
  assert.equal(providerCalls,beforeCalls)
})

test('legacy x-paystack-signature continues working until secret rotation',async()=>{
  const reference='webhook_legacy_'+randomUUID()
  providerSuccess(reference)
  const before=await balance()
  const result=await post(payload(reference),{modern:false})
  assert.equal(result.status,200)
  assert.equal(await balance(),before+100)
})

test('provider timeout and Paystack service failure return 503, then retry posts once',async()=>{
  const reference='webhook_retry_'+randomUUID(),event=payload(reference)
  const before=await balance(),n=await credits()
  global.fetch=async()=>{providerCalls++;throw new Error('Temporary mocked network failure')}
  const outage=await post(event)
  assert.equal(outage.status,503)
  assert.equal(outage.headers['retry-after'],'60')
  assert.equal(await balance(),before)
  global.fetch=async()=>{providerCalls++;return {ok:false,json:async()=>({status:false,message:'provider 503'})}}
  assert.equal((await post(event)).status,503)
  assert.equal(await credits(),n)
  providerSuccess(reference)
  assert.equal((await post(event)).status,200)
  assert.equal((await post(event)).status,200)
  assert.equal(await balance(),before+100)
  assert.equal(await credits(),n+1)
})

test('temporary PostgreSQL failure rolls back and leaves signed webhook eligible for retry',async()=>{
  const reference='webhook_db_retry_'+randomUUID(),event=payload(reference)
  providerSuccess(reference)
  const before=await balance(),n=await credits()
  // Target only this new reference; previous successful top-ups must stay
  // valid when the failure-injection constraint is installed.
  await pool.query(`ALTER TABLE wallet_transactions ADD CONSTRAINT reject_webhook_test
    CHECK (reference <> '${reference}')`)
  try{
    const failed=await post(event)
    assert.equal(failed.status,503)
    assert.equal(failed.body.error,'Temporary payment-processing failure. Please retry delivery.')
    assert.equal(await credits(),n)
    assert.equal(await balance(),before)
  }finally{
    await pool.query('ALTER TABLE wallet_transactions DROP CONSTRAINT reject_webhook_test')
  }
  assert.equal((await post(event)).status,200)
  assert.equal((await post(event)).status,200)
  assert.equal(await balance(),before+100)
  assert.equal(await credits(),n+1)
})

test('verified metadata mismatch and insufficient payment are permanently rejected without credit',async()=>{
  for(const bad of [
    {metadata:{wallet_topup:true,user_id:randomUUID(),intended_amount:100}},
    {amount:9950},
    {currency:'USD'},
    {status:'failed'},
  ]){
    const reference='webhook_invalid_'+randomUUID()
    providerSuccess(reference,bad)
    const oldBalance=await balance(),oldCount=await credits()
    const response=await post(payload(reference))
    assert.equal(response.status,200)
    assert.equal(response.body.processed,false)
    assert.equal(await balance(),oldBalance)
    assert.equal(await credits(),oldCount)
  }
})
