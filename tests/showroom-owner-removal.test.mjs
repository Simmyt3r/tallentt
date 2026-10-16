import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { testDatabase } from './database.mjs'

const ownerId=randomUUID(), strangerId=randomUUID(), hatId=randomUUID()
let db,pool,handler,signSession

before(async()=>{
  db=await testDatabase()
  pool=db.pool
  global.__tworldPool=pool
  process.env.JWT_SECRET='showroom-owner-removal-test-secret'
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  await pool.query(await readFile(new URL('../db/patch-showroom-owner-removal-2026-10.sql',import.meta.url),'utf8'))
  for(const [id,username] of [[ownerId,'showowner'],[strangerId,'showstranger']]){
    await pool.query("INSERT INTO users(id,username,full_name,email,password_hash) VALUES ($1,$2,$2,$3,'x')",
      [id,username,username+'@example.test'])
  }
  await pool.query("INSERT INTO hats(id,user_id,hat_title,username,category) VALUES ($1,$2,'Singer','showowner','Music')",[hatId,ownerId])
  signSession=(await import('../api/_lib/auth.js')).signSession
  handler=(await import('../api/showroom/index.js')).default
})
after(async()=>{await db?.close();delete global.__tworldPool})

async function call({who=ownerId,action='visibility',method='GET'}={}){
  const body={action,hat_id:hatId}
  const url=method==='GET'
    ? '/api/showroom?action='+action+'&hat_id='+hatId
    : '/api/showroom'
  const req=Readable.from(method==='POST'?[Buffer.from(JSON.stringify(body))]:[])
  Object.assign(req,{url,method,headers:{host:'localhost',cookie:who?'cw_session='+signSession({sub:who}):''}})
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},
    end(data){this.body=JSON.parse(data)}}
  await handler(req,res)
  return {status:res.statusCode,body:res.body}
}

test('only owner may remove a Hat from Showroom; stranger cannot hide it',async()=>{
  assert.deepEqual((await call()).body,{hidden:false})
  assert.equal((await call({who:null,action:'remove_own',method:'POST'})).status,401)
  assert.equal((await call({who:strangerId,action:'remove_own',method:'POST'})).status,403)
  const removed=await call({action:'remove_own',method:'POST'})
  assert.equal(removed.status,200,JSON.stringify(removed.body))
  assert.equal(removed.body.removed,true)
  assert.equal((await call()).body.hidden,true)
  assert.equal((await call({who:strangerId,action:'restore_own',method:'POST'})).status,403)
  const own=await call({action:'my_hidden'})
  assert.deepEqual(own.body.hatIds,[hatId])
})

test('restoring an owned post is safe and does not remove the Hat',async()=>{
  const response=await call({action:'restore_own',method:'POST'})
  assert.equal(response.status,200,JSON.stringify(response.body))
  assert.equal(response.body.restored,true)
  assert.equal((await call()).body.hidden,false)
  assert.deepEqual((await call({action:'my_hidden'})).body.hatIds,[])
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM hats WHERE id=$1',[hatId])).rows[0].n,1)
  const repeated=await call({action:'restore_own',method:'POST'})
  assert.equal(repeated.status,200)
})
