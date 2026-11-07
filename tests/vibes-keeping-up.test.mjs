import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {Readable} from 'node:stream'
import {readFile} from 'node:fs/promises'
import {testDatabase} from './database.mjs'

let db,pool,handler,sign
const users={viewer:randomUUID(),talent:randomUUID(),stranger:randomUUID(),other:randomUUID()}
const posts=[]
before(async()=>{
  db=await testDatabase();pool=db.pool;global.__tworldPool=pool
  process.env.JWT_SECRET='vibes-keeping-up-test-secret'
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  for(const patch of ['patch-vibes-2026-10.sql','patch-associates-2026-10.sql']){
    const sql=await readFile(new URL('../db/'+patch,import.meta.url),'utf8')
    await pool.query(sql);await pool.query(sql)
  }
  for(const [name,id] of Object.entries(users))
    await pool.query(`INSERT INTO users(id,username,full_name,email,password_hash,role)
      VALUES($1,$2,$3,$4,'test','dual')`,[id,name+'_keepup',name+' user',name+'@test.example'])
  for(let n=0;n<26;n++){
    const id=randomUUID()
    posts.push(id)
    await pool.query(`INSERT INTO vibes_posts(id,author_id,body,created_at)
      VALUES($1,$2,$3,NOW()-$4::int*INTERVAL '1 minute')`,[id,users.talent,'Following '+n,n+1])
  }
  await pool.query(`INSERT INTO vibes_posts(author_id,body,created_at)
      VALUES($1,'Unfollowed public Vibe',NOW()+INTERVAL '1 hour')`,[users.stranger])
  await pool.query(`INSERT INTO vibes_posts(author_id,body,moderation_status)
      VALUES($1,'Held unsafe Vibe','held')`,[users.talent])
  await pool.query(`INSERT INTO vibes_posts(author_id,body,deleted_at)
      VALUES($1,'Deleted Vibe',NOW())`,[users.talent])
  handler=(await import('../api/vibes/index.js')).default
  sign=(await import('../api/_lib/auth.js')).signSession
})
after(async()=>{await db?.close();delete global.__tworldPool;delete process.env.JWT_SECRET})
async function get(path,who='viewer'){
  const req=Readable.from([])
  Object.assign(req,{method:'GET',url:'/api/vibes'+path,headers:{host:'localhost',
    cookie:who?'cw_session='+sign({sub:users[who]}):''}})
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},end(raw){this.body=JSON.parse(raw)}}
  await handler(req,res)
  return {status:res.statusCode,body:res.body,headers:res.headers}
}
test('Keeping Up includes only the signed-in viewer follows; For You still discovers strangers',async()=>{
  await pool.query('INSERT INTO subscriber_follows(follower_id,followed_id) VALUES($1,$2)',[users.viewer,users.talent])
  const forYou=await get('?feed=for_you')
  assert.equal(forYou.status,200,JSON.stringify(forYou.body))
  assert.ok(forYou.body.posts.some(p=>p.body==='Unfollowed public Vibe'))
  const following=await get('?feed=keeping_up&follower_id='+users.other)
  assert.equal(following.status,200,JSON.stringify(following.body))
  assert.equal(following.headers['Cache-Control'],'private, no-store')
  assert.equal(following.body.feed,'keeping_up')
  assert.equal(following.body.posts.length,20)
  assert.ok(following.body.posts.every(p=>p.author_id===users.talent))
  assert.ok(following.body.posts.every(p=>p.moderation_status!=='held'))
  assert.ok(!following.body.posts.some(p=>p.body.includes('Held')||p.body.includes('Deleted')))
  const notFollowing=await get('?feed=keeping_up','other')
  assert.deepEqual(notFollowing.body.posts,[],'Another viewer must not inherit this user’s follows')
})
test('Keeping Up pagination is stable, distinct, and independently searchable',async()=>{
  const first=await get('?feed=keeping_up')
  assert.equal(first.body.posts.length,20)
  assert.ok(first.body.nextCursor)
  const second=await get('?feed=keeping_up&before='+first.body.nextCursor)
  assert.equal(second.status,200)
  assert.equal(second.body.posts.length,6)
  assert.equal(second.body.nextCursor,null)
  assert.equal(new Set([...first.body.posts,...second.body.posts].map(p=>p.id)).size,26)
  assert.ok(second.body.posts.every(p=>p.body.startsWith('Following')))
  const searched=await get('?feed=keeping_up&search=Following%2025')
  assert.equal(searched.body.posts.length,1)
  assert.equal(searched.body.posts[0].body,'Following 25')
  const strangerSearch=await get('?feed=keeping_up&search=Unfollowed')
  assert.equal(strangerSearch.body.posts.length,0)
})
test('A direct post remains addressable even when it is not in Keeping Up',async()=>{
  const {rows:[post]}=await pool.query("SELECT id FROM vibes_posts WHERE body='Unfollowed public Vibe'")
  const link=await get('?feed=keeping_up&post='+post.id)
  assert.equal(link.status,200)
  assert.equal(link.body.posts[0].id,post.id)
  const unfollowed=await get('?feed=keeping_up&post='+posts[0]+'&search=wrong')
  assert.equal(unfollowed.status,200)
  assert.equal(unfollowed.body.posts.length,0,'Search is still enforced on direct links')
  assert.equal((await get('?feed=private')).status,400)
  assert.equal((await get('?feed=keeping_up&before=wrong')).status,400)
  assert.equal((await get('?feed=keeping_up',null)).status,401)
})
test('Unfollowing removes posts from Keeping Up without deleting history or creating false posts',async()=>{
  await pool.query('DELETE FROM subscriber_follows WHERE follower_id=$1 AND followed_id=$2',[users.viewer,users.talent])
  const following=await get('?feed=keeping_up')
  assert.deepEqual(following.body.posts,[])
  assert.equal(following.body.nextCursor,null)
  assert.ok((await get('?feed=for_you')).body.posts.length>0,'For You is unaffected')
})
test('Missing Associates migration fails explicitly without silently showing everyone',async()=>{
  await pool.query('DROP TABLE subscriber_follows')
  const response=await get('?feed=keeping_up')
  assert.equal(response.status,503)
  assert.match(response.body.error,/Associates & Inbox migration/)
  assert.equal((await get('?feed=for_you')).status,200)
})
