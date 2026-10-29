import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {testDatabase} from './database.mjs'

test('unified messaging preserves private replies and bounded read receipts',async()=>{
 const db=await testDatabase();global.__tworldPool=db.pool
 try{
  const pool=db.pool
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  const patch=await readFile(new URL('../db/patch-messaging-2026-10.sql',import.meta.url),'utf8')
  await pool.query(patch);await pool.query(patch)
  const alice=randomUUID(),bob=randomUUID(),eve=randomUUID()
  for(const [id,name] of [[alice,'alice'],[bob,'bob'],[eve,'eve']])
   await pool.query(`INSERT INTO users(id,full_name,username,email,password_hash,role)
    VALUES($1,$2,$2,$3,'test','dual')`,[id,name,name+'@example.test'])
  const {communityChatsAction:act,communityChatsGet:get}=await import('../api/_lib/communityChats.js')
  const {thread_id:chat}=await act(alice,{action:'community_start',recipient_id:bob,text:'First'})
  await act(bob,{action:'community_respond',thread_id:chat,decision:'accepted'})
  const first=(await get(bob,new URLSearchParams({community_thread:chat}))).messages[0]
  await act(alice,{action:'community_send',thread_id:chat,text:'Second',reply_to_id:first.id})
  assert.equal((await get(bob,new URLSearchParams())).threads[0].unread_count,2)
  await assert.rejects(act(eve,{action:'community_read',thread_id:chat,through_id:first.id}),/not found/)
  await act(bob,{action:'community_read',thread_id:chat,through_id:first.id})
  let messages=(await get(alice,new URLSearchParams({community_thread:chat}))).messages
  assert.ok(messages[0].read_at);assert.equal(messages[1].read_at,null)
  assert.equal(messages[1].reply_body,'First');assert.equal(messages[1].reply_sender_id,alice)
  assert.equal((await get(bob,new URLSearchParams())).threads[0].unread_count,1)
  const {thread_id:other}=await act(eve,{action:'community_start',recipient_id:alice,text:'Private'})
  const foreign=(await get(eve,new URLSearchParams({community_thread:other}))).messages[0]
  await assert.rejects(act(bob,{action:'community_read',thread_id:chat,through_id:foreign.id}),/does not belong/)
  await assert.rejects(act(bob,{action:'community_send',thread_id:chat,text:'Leak',reply_to_id:foreign.id}),/does not belong/)
  await act(bob,{action:'community_respond',thread_id:chat,decision:'blocked'})
  await assert.rejects(act(alice,{action:'community_send',thread_id:chat,text:'Blocked reply',reply_to_id:first.id}),/Accept/)

  const hat=randomUUID(),deal=randomUUID(),deal2=randomUUID()
  await pool.query(`INSERT INTO hats(id,user_id,username,hat_title,hat_name,category,role)
   VALUES($1,$2,'bob','Photography','Photo','Arts','talent')`,[hat,bob])
  for(const id of [deal,deal2])await pool.query(`INSERT INTO escrows(id,hat_id,client_id,talent_id,amount)
   VALUES($1,$2,$3,$4,5000)`,[id,hat,alice,bob])
  const {threadAction,getThread,getConversations}=await import('../api/_lib/bookingThreads.js')
  const send=(id,body,reply)=>threadAction(alice,{action:'send_message',escrow_id:id,body,reply_to_id:reply,client_token:randomUUID()})
  const original=await send(deal,'Original')
  await send(deal,'Reply',original.id)
  const privateMessage=await send(deal2,'Private deal')
  await assert.rejects(send(deal,'Leak',privateMessage.id),/does not belong/)
  await assert.rejects(threadAction(eve,{action:'send_message',escrow_id:deal,body:'Intrusion',client_token:randomUUID(),reply_to_id:original.id}),/not found/)
  await threadAction(bob,{action:'read_messages',escrow_id:deal,through_id:original.id})
  messages=(await getThread(alice,deal)).messages
  assert.ok(messages[0].read_at);assert.equal(messages[1].read_at,null)
  assert.equal(messages[1].reply_body,'Original');assert.equal(messages[1].reply_to_id,original.id)
  const summary=(await getConversations(bob)).conversations.find(item=>item.id===deal)
  assert.equal(summary.last_message,'Reply');assert.ok(summary.last_at);assert.equal(summary.unread_count,1)
 }finally{delete global.__tworldPool;await db.close()}
})
