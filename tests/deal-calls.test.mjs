import test, {before,after} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {testDatabase} from './database.mjs'

let pool,db,calls
const clientId=randomUUID(),talentId=randomUUID(),strangerId=randomUUID(),hatId=randomUUID(),dealId=randomUUID()
let callId
before(async()=>{
  db=await testDatabase()
  pool=db.pool
  global.__tworldPool=pool
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  await pool.query(await readFile(new URL('../db/patch-deal-calls-2026-10.sql',import.meta.url),'utf8'))
  for(const [id,name,role] of [[clientId,'calling_client','client'],
    [talentId,'calling_talent','talent'],[strangerId,'calling_stranger','dual']]){
    await pool.query('INSERT INTO users(id,full_name,username,email,password_hash,role) VALUES($1,$2,$2,$3,$4,$5)',
      [id,name,name+'@example.test','hash',role])
  }
  await pool.query("INSERT INTO hats(id,user_id,hat_title,username,category) VALUES($1,$2,'Photography','calling_talent','Photography')",
    [hatId,talentId])
  await pool.query(`INSERT INTO escrows(id,hat_id,client_id,talent_id,amount,status,contacts_unlocked,work_status)
    VALUES($1,$2,$3,$4,2000,'secured',true,'in_progress')`,[dealId,hatId,clientId,talentId])
  calls=await import('../api/_lib/dealCalls.js')
})
after(async()=>{await db?.close();delete global.__tworldPool})

test('only a funded and unlocked booking participant may initiate a call',async()=>{
  await assert.rejects(calls.dealCallAction(strangerId,{action:'start_call',escrow_id:dealId,mode:'audio'}),{status:404})
  const result=await calls.dealCallAction(clientId,{action:'start_call',escrow_id:dealId,mode:'video'})
  callId=result.id
  assert.ok(callId)
  await assert.rejects(calls.dealCallAction(talentId,{action:'start_call',escrow_id:dealId,mode:'audio'}),{status:409})
  await assert.rejects(calls.getDealCall(strangerId,dealId,0),{status:404})
  const incoming=await calls.getDealCall(talentId,dealId)
  assert.equal(incoming.call.callee_id,talentId)
  assert.equal(incoming.call.mode,'video')
  assert.equal(incoming.call.status,'ringing')
})

test('only caller may offer, only callee can accept and answer',async()=>{
  const offer={type:'offer',sdp:'v=0\r\n'}
  await assert.rejects(calls.dealCallAction(talentId,{
    action:'call_signal',call_id:callId,kind:'offer',payload:offer,
  }),{status:403})
  assert.equal((await calls.dealCallAction(clientId,{
    action:'call_signal',call_id:callId,kind:'offer',payload:offer,
  })).ok,true)
  await assert.rejects(calls.dealCallAction(clientId,{action:'accept_call',call_id:callId}),{status:403})
  assert.equal((await calls.dealCallAction(talentId,{action:'accept_call',call_id:callId})).ok,true)
  const incoming=await calls.getDealCall(talentId,dealId)
  assert.equal(incoming.call.status,'accepted')
  assert.equal(incoming.signals[0].payload.type,'offer')
  assert.equal((await calls.dealCallAction(talentId,{
    action:'call_signal',call_id:callId,kind:'answer',payload:{type:'answer',sdp:'v=0'},
  })).ok,true)
  const result=await calls.getDealCall(clientId,dealId,incoming.cursor)
  assert.equal(result.signals[0].kind,'answer')
})

test('invalid signals are rejected without escrow or wallet mutation',async()=>{
  await assert.rejects(calls.dealCallAction(strangerId,{
    action:'call_signal',call_id:callId,kind:'ice',payload:{candidate:'abc'},
  }),{status:404})
  await assert.rejects(calls.dealCallAction(clientId,{
    action:'call_signal',call_id:callId,kind:'answer',payload:{type:'answer',sdp:'v=0'},
  }),{status:403})
  await assert.rejects(calls.dealCallAction(clientId,{
    action:'call_signal',call_id:callId,kind:'ice',payload:{candidate:'x'.repeat(5000)},
  }),{status:422})
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM wallet_transactions')).rows[0].n,0)
  assert.equal((await pool.query('SELECT status FROM escrows WHERE id=$1',[dealId])).rows[0].status,'secured')
})

test('hangup erases SDP and ICE and allows another call',async()=>{
  assert.equal((await calls.dealCallAction(clientId,{action:'end_call',call_id:callId})).ok,true)
  assert.equal((await calls.getDealCall(talentId,dealId)).call,null)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM deal_call_signals WHERE call_id=$1',[callId])).rows[0].n,0)
  const newer=await calls.dealCallAction(talentId,{action:'start_call',escrow_id:dealId,mode:'audio'})
  assert.ok(newer.id)
  assert.equal((await calls.dealCallAction(clientId,{action:'decline_call',call_id:newer.id})).ok,true)
})

test('expired sessions and locked/disputed deals cannot be called',async()=>{
  const newer=await calls.dealCallAction(clientId,{action:'start_call',escrow_id:dealId,mode:'audio'})
  await pool.query("UPDATE deal_calls SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1",[newer.id])
  assert.equal((await calls.getDealCall(talentId,dealId)).call,null)
  await pool.query("UPDATE escrows SET work_status='disputed' WHERE id=$1",[dealId])
  await assert.rejects(calls.dealCallAction(clientId,{action:'start_call',escrow_id:dealId,mode:'audio'}),{status:409})
})
