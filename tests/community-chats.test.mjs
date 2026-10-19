import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {testDatabase} from './database.mjs'

let database,pool,communityChatsAction,communityChatsGet
const alice=randomUUID(),bob=randomUUID(),eve=randomUUID()
before(async()=>{
 database=await testDatabase();pool=database.pool
 global.__tworldPool=pool
 await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
 const mod=await import('../api/_lib/communityChats.js')
 communityChatsAction=mod.communityChatsAction;communityChatsGet=mod.communityChatsGet
 for(const [id,username] of [[alice,'al_chat'],[bob,'bob_chat'],[eve,'eve_chat']])
  await pool.query(`INSERT INTO users(id,full_name,username,email,password_hash)
   VALUES($1,$2,$2,$3,'test')`,[id,username,username+'@example.test'])
})
after(async()=>{await database?.close();delete global.__tworldPool})
test('general chat requires accepting one introduction before normal messages',async()=>{
 const created=await communityChatsAction(alice,{action:'community_start',
   recipient_id:bob,text:'Hello! Can we collaborate?'})
 assert.equal(created.status,'pending')
 const threadId=created.thread_id
 const inbox=await communityChatsGet(bob,new URLSearchParams('community=1'))
 assert.ok(inbox.threads.some(t=>t.id===threadId&&t.status==='pending'))
 await assert.rejects(communityChatsAction(alice,{action:'community_send',
   thread_id:threadId,text:'Unapproved second message'}),/Accept the chat request/)
 await assert.rejects(communityChatsAction(eve,{action:'community_respond',
   thread_id:threadId,decision:'accepted'}),/Conversation not found/)
 await communityChatsAction(bob,{action:'community_respond',
   thread_id:threadId,decision:'accepted'})
 const accepted=await communityChatsAction(alice,{action:'community_send',
   thread_id:threadId,text:'Thanks for accepting.'})
 assert.equal(accepted.ok,true)
 const messages=await communityChatsGet(bob,new URLSearchParams('community_thread='+threadId))
 assert.equal(messages.messages.length,2)
 assert.equal(messages.messages[0].body,'Hello! Can we collaborate?')
 await assert.rejects(communityChatsGet(eve,
   new URLSearchParams('community_thread='+threadId)),/Conversation not found/)
})
test('search matches public handles but not private email',async()=>{
 const search=await communityChatsGet(alice,new URLSearchParams('community_users=1&q=bob'))
 assert.ok(search.users.some(u=>u.username==='bob_chat'))
 const privateLookup=await communityChatsGet(alice,
   new URLSearchParams('community_users=1&q=%40example.test'))
 assert.equal(privateLookup.users.length,0)
})
test('declining a request prevents unsolicited follow-up messages',async()=>{
 const created=await communityChatsAction(eve,{action:'community_start',
   recipient_id:alice,text:'Would you like to connect?'})
 await communityChatsAction(alice,{action:'community_respond',thread_id:created.thread_id,decision:'declined'})
 await assert.rejects(communityChatsAction(eve,{action:'community_send',
   thread_id:created.thread_id,text:'Keep messaging'}),/Accept the chat request/)
 await assert.rejects(communityChatsAction(eve,{action:'community_start',
   recipient_id:alice,text:'Another attempt'}),/pending, rejected, or blocked/)
})
