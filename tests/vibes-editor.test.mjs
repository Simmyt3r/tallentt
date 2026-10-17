import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {Readable} from 'node:stream'
import {testDatabase} from './database.mjs'

let db,pool,handler,signSession
const alice=randomUUID(),bob=randomUUID()
before(async()=>{
 db=await testDatabase();pool=db.pool;global.__tworldPool=pool
 process.env.JWT_SECRET='vibes-editor-tests-not-prod'
 await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
 await pool.query(await readFile(new URL('../db/patch-vibes-editor-2026-10.sql',import.meta.url),'utf8'))
 await pool.query(await readFile(new URL('../db/patch-online-presence-2026-10.sql',import.meta.url),'utf8'))
 for(const [id,username] of [[alice,'vibes_alice'],[bob,'vibes_bob']]){
  await pool.query("INSERT INTO users(id,username,full_name,email,password_hash) VALUES($1,$2,$2,$3,'test')",
   [id,username,username+'@example.test'])
 }
 handler=(await import('../api/vibes/index.js')).default
 signSession=(await import('../api/_lib/auth.js')).signSession
})
after(async()=>{await db?.close();delete global.__tworldPool})
async function http({who=alice,action=null,post_id,comment_id,text,method='POST',path}={}){
 const data=action?{action,post_id,comment_id,text}:{}
 const request=Readable.from(method==='POST'?[Buffer.from(JSON.stringify(data))]:[])
 Object.assign(request,{method,url:path||'/api/vibes',headers:{host:'localhost',
   cookie:who?'cw_session='+signSession({sub:who}):''}})
 const response={statusCode:200,setHeader(){},end(raw){this.body=JSON.parse(raw)}}
 await handler(request,response)
 return response
}
test('long Vibes post is editable by owner, rejected for others, deleted later',async()=>{
 const created=await http({action:'publish',text:'a'.repeat(1600)})
 assert.equal(created.statusCode,201,JSON.stringify(created.body))
 const post=created.body.id
 const wrong=await http({who:bob,action:'edit_post',post_id:post,text:'altered'})
 assert.equal(wrong.statusCode,404)
 const edit=await http({action:'edit_post',post_id:post,text:'Professional opinion, revised.'})
 assert.equal(edit.statusCode,200)
 const loaded=await http({method:'GET'})
 assert.equal(loaded.body.posts.find(p=>p.id===post)?.body,'Professional opinion, revised.')
 assert.ok(loaded.body.posts.find(p=>p.id===post)?.edited_at)
 const oversize=await http({action:'edit_post',post_id:post,text:'x'.repeat(10001)})
 assert.equal(oversize.statusCode,400)
 const deleted=await http({action:'delete',post_id:post})
 assert.equal(deleted.statusCode,200)
})
test('replies longer than old 300-char limit can be edited by their author',async()=>{
 const result=await http({action:'publish',text:'Discuss this idea'})
 const id=result.body.id
 const created=await http({who:bob,action:'reply',post_id:id,text:'long '.repeat(200)})
 assert.equal(created.statusCode,200,JSON.stringify(created.body))
 const replyId=created.body.id
 const wrong=await http({action:'edit_reply',post_id:id,comment_id:replyId,text:'spoof'})
 assert.equal(wrong.statusCode,404)
 const edit=await http({who:bob,action:'edit_reply',post_id:id,comment_id:replyId,text:'Updated reply'})
 assert.equal(edit.statusCode,200)
 const comments=await http({method:'GET',path:'/api/vibes?comments='+id})
 assert.equal(comments.body.comments.find(c=>c.id===replyId).body,'Updated reply')
 const removed=await http({who:bob,action:'delete_reply',post_id:id,comment_id:replyId})
 assert.equal(removed.statusCode,200)
})
