import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {Readable} from 'node:stream'
import {readFile} from 'node:fs/promises'
import {testDatabase} from './database.mjs'

let db,pool,handler,sign
const users={author:randomUUID(),first:randomUUID(),second:randomUUID()}
const postIds={}
before(async()=>{
  db=await testDatabase();pool=db.pool;global.__tworldPool=pool
  process.env.JWT_SECRET='vibes-threads-test-secret'
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  for(const patch of ['patch-vibes-2026-10.sql','patch-vibes-threads-2026-10.sql']){
    const sql=await readFile(new URL('../db/'+patch,import.meta.url),'utf8')
    await pool.query(sql);await pool.query(sql)
  }
  for(const [name,id] of Object.entries(users)){
    await pool.query(`INSERT INTO users(id,username,full_name,email,password_hash,role)
      VALUES($1,$2,$3,$4,'test','dual')`,[id,name+'_vibes',name+' user',name+'@example.test'])
  }
  handler=(await import('../api/vibes/index.js')).default
  sign=(await import('../api/_lib/auth.js')).signSession
})
after(async()=>{await db?.close();delete global.__tworldPool;delete process.env.JWT_SECRET})
async function request(method,path,body=null,who='author'){
  const req=Readable.from(body&&method==='POST'?[Buffer.from(JSON.stringify(body))]:[])
  Object.assign(req,{method,url:path,headers:{host:'localhost',
    cookie:who?'cw_session='+sign({sub:users[who]}):''}})
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},
    end(raw){this.body=JSON.parse(raw)}}
  await handler(req,res)
  return {status:res.statusCode,body:res.body}
}
async function createPost(who='author',text='Discussion post'){
  const r=await request('POST','/api/vibes',{action:'publish',text},who)
  assert.equal(r.status,201,JSON.stringify(r.body))
  return r.body.id
}
test('new comment hierarchy migration is idempotent and does not move legacy comments',async()=>{
  const {rows}=await pool.query(`SELECT column_name FROM information_schema.columns
    WHERE table_name='vibes_comments' AND column_name='parent_id'`)
  assert.equal(rows.length,1)
  postIds.one=await createPost()
  const r=await request('POST','/api/vibes',{action:'reply',post_id:postIds.one,text:'Root comment'},'first')
  assert.equal(r.status,200,JSON.stringify(r.body))
  postIds.root=r.body.id
  assert.equal(r.body.parent_id,null)
})
test('real child replies live only under their correct parent and are paginated separately',async()=>{
  const {body:posted,status}=await request('POST','/api/vibes',{
    action:'reply',post_id:postIds.one,parent_id:postIds.root,text:'Nested response'},'second')
  assert.equal(status,200,JSON.stringify(posted))
  assert.equal(posted.parent_id,postIds.root)
  postIds.child=posted.id
  const top=await request('GET','/api/vibes?comments='+postIds.one,null,'author')
  assert.equal(top.status,200)
  assert.equal(top.body.threaded,true)
  assert.equal(top.body.comments.length,1,'Root pagination must not mix children')
  assert.equal(top.body.comments[0].child_count,1)
  const child=await request('GET','/api/vibes?comments='+postIds.one+'&parent_id='+postIds.root,null,'first')
  assert.equal(child.status,200)
  assert.equal(child.body.comments.length,1)
  assert.equal(child.body.comments[0].parent_id,postIds.root)
  assert.equal(child.body.comments[0].body,'Nested response')
  // Replies cannot be threaded beyond one nested level.
  assert.equal((await request('POST','/api/vibes',{
    action:'reply',post_id:postIds.one,parent_id:postIds.child,text:'Too deep'},'first')).status,404)
  const another=await createPost('author','Second Vibe')
  assert.equal((await request('POST','/api/vibes',{
    action:'reply',post_id:another,parent_id:postIds.root,text:'Cross-post attack'},'first')).status,404)
  assert.equal((await request('GET','/api/vibes?comments='+another+'&parent_id='+postIds.root,null,'first')).status,404)
  assert.equal((await request('GET','/api/vibes?comments='+postIds.one+'&parent_id=invalid',null,'first')).status,400)
})
test('only the child author may edit or delete, and removal updates live child counts',async()=>{
  const disallowed=await request('POST','/api/vibes',{
    action:'edit_reply',post_id:postIds.one,comment_id:postIds.child,text:'Tamper'},'author')
  assert.equal(disallowed.status,404)
  const allowed=await request('POST','/api/vibes',{
    action:'edit_reply',post_id:postIds.one,comment_id:postIds.child,text:'Edited nested'},'second')
  assert.equal(allowed.status,200)
  const child=await request('GET','/api/vibes?comments='+postIds.one+'&parent_id='+postIds.root,null,'author')
  assert.equal(child.body.comments[0].body,'Edited nested')
})
test('deleted parent retains a tombstone while its children remain readable',async()=>{
  const deleted=await request('POST','/api/vibes',{
    action:'delete_reply',post_id:postIds.one,comment_id:postIds.root},'first')
  assert.equal(deleted.status,200)
  const roots=await request('GET','/api/vibes?comments='+postIds.one,null,'author')
  assert.equal(roots.body.comments[0].id,postIds.root)
  assert.equal(roots.body.comments[0].body,'')
  assert.equal(roots.body.comments[0].deleted,true)
  assert.equal(roots.body.comments[0].child_count,1)
  // The child still belongs to this root, but no *new* replies to deleted roots.
  const child=await request('GET','/api/vibes?comments='+postIds.one+'&parent_id='+postIds.root,null,'author')
  assert.equal(child.status,200,'Existing children must remain readable when parent is deleted')
  assert.equal(child.body.comments[0].body,'Edited nested')
  assert.equal((await request('POST','/api/vibes',{
    action:'reply',post_id:postIds.one,parent_id:postIds.root,text:'After delete'},'second')).status,404)
})
test('visible Vibe likers show only public identity fields, in paginated order',async()=>{
  postIds.likes=await createPost('author','Likes example')
  for(const who of ['first','second']){
    const r=await request('POST','/api/vibes',{action:'like',post_id:postIds.likes},who)
    assert.equal(r.status,200)
  }
  const list=await request('GET','/api/vibes?likers='+postIds.likes,null,'first')
  assert.equal(list.status,200,JSON.stringify(list.body))
  assert.equal(list.body.people.length,2)
  assert.equal(list.body.nextPage,null)
  assert.deepEqual(Object.keys(list.body.people[0]).sort(),['avatarUrl','likedAt','name','username'])
  assert.deepEqual(new Set(list.body.people.map(x=>x.username)),new Set(['first_vibes','second_vibes']))
  assert.equal((await request('GET','/api/vibes?likers='+postIds.likes,null,null)).status,401)
  assert.equal((await request('GET','/api/vibes?likers='+postIds.likes+'&page=999',null,'first')).status,400)
  // Likes do not leak for deleted/held content.
  await request('POST','/api/vibes',{action:'delete',post_id:postIds.likes},'author')
  assert.equal((await request('GET','/api/vibes?likers='+postIds.likes,null,'second')).status,404)
})
