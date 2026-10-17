import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {Readable} from 'node:stream'
import {randomUUID} from 'node:crypto'
import {testDatabase} from './database.mjs'

let db,pool,handler,auth,signSession
const owner=randomUUID(),viewer=randomUUID(),stranger=randomUUID(),hatId=randomUUID()
before(async()=>{
  db=await testDatabase();pool=db.pool;global.__tworldPool=pool
  process.env.JWT_SECRET='card-detail-tests-not-a-production-secret'
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  await pool.query(await readFile(new URL('../db/patch-card-detail-2026-10.sql',import.meta.url),'utf8'))
  for(const [id,name] of [[owner,'qualified_talent'],[viewer,'client_viewer'],[stranger,'bystander']]){
    await pool.query(`INSERT INTO users(id,full_name,username,email,password_hash,
      profile_statement,bio,phone) VALUES($1,$2,$2,$3,'test',$4,'Short tagline',$5)`,
      [id,name,name+'@example.test',
        id===owner?'Four years of professional welding and on-site structural fabrication.':'',
        id===owner?'+2348000000100':null])
  }
  await pool.query(`INSERT INTO hats(id,user_id,hat_title,hat_name,username,category,
      role,hat_type,hiring_duration,job_requirements,motto,rate,rate_unit)
      VALUES($1,$2,'Welder Level 2','Industrial welder','qualified_talent','Skilled Trades',
        'talent','Contract','1 month','Valid site safety practices and welding deliverables',
        'Short Hat tagline',500000,'month')`,[hatId,owner])
  await pool.query(`INSERT INTO applications(hat_id,applicant_id,status) VALUES($1,$2,'pending')`,
    [hatId,viewer])
  handler=(await import('../api/hats/[id].js')).default
  auth=(await import('../api/auth/index.js')).default
  signSession=(await import('../api/_lib/auth.js')).signSession
})
after(async()=>{await db?.close();delete global.__tworldPool})
async function req(fn,path,{who=null,method='GET',body}={}){
  const stream=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[])
  Object.assign(stream,{method,url:path,headers:{host:'localhost',
    cookie:who?'cw_session='+signSession({sub:who}):''}})
  const res={statusCode:200,setHeader(){},end(value){this.body=JSON.parse(value)}}
  await fn(stream,res)
  return res
}
test('separate statements and job details with exact per-Hat application counts',async()=>{
  const {statusCode,body}=await req(handler,'/api/hats/'+hatId+'?include=owner')
  assert.equal(statusCode,200,JSON.stringify(body))
  assert.match(body.owner.statement,/professional welding/)
  assert.match(body.job_requirements,/site safety/)
  assert.equal(body.tagline,'Short Hat tagline')
  assert.notEqual(body.description,body.tagline)
  assert.equal(body.job.type,'Contract')
  assert.equal(body.job.duration,'1 month')
  assert.equal(body.job.applicants,1)
  assert.equal(body.job.active_applicants,1)
  assert.equal(body.budget.unit,'month')
  assert.equal(body.performance.completed_jobs,0)
  assert.equal(body.performance.successful_hires,0)
  assert.equal(body.performance.open_disputes,0)
  assert.equal(body.owner.phone,null)
  assert.equal(body.owner.contact_unlocked,false)
})
test('phone stays private until the viewer is in a funded unlocked deal',async()=>{
  const anonymous=(await req(handler,'/api/hats/'+hatId+'?include=owner')).body
  assert.equal(anonymous.owner.phone,null)
  await pool.query(`INSERT INTO escrows(hat_id,talent_id,client_id,amount,status,contacts_unlocked)
    VALUES($1,$2,$3,500000,'secured',true)`,[hatId,owner,viewer])
  const allowed=(await req(handler,'/api/hats/'+hatId+'?include=owner',{who:viewer})).body
  const unknown=(await req(handler,'/api/hats/'+hatId+'?include=owner',{who:stranger})).body
  assert.equal(allowed.owner.phone,'+2348000000100')
  assert.equal(allowed.owner.contact_unlocked,true)
  assert.equal(unknown.owner.phone,null)
  const legacy=(await req(handler,'/api/hats/'+hatId)).body
  assert.ok(!JSON.stringify(legacy).includes('+2348000000100'),'legacy/public Hat shape must never leak phone')
})
test('professional statement updates are validated and stored independently',async()=>{
  const long='Newly trained in advanced welding techniques and site supervision.'
  const response=await req(auth,'/api/auth',{who:owner,method:'PUT',body:{profileStatement:long}})
  assert.equal(response.statusCode,200,JSON.stringify(response.body))
  assert.equal(response.body.user.profileStatement,long)
  const row=(await pool.query('SELECT bio,profile_statement FROM users WHERE id=$1',[owner])).rows[0]
  assert.equal(row.bio,'Short tagline')
  assert.equal(row.profile_statement,long)
  const bad=await req(auth,'/api/auth',{who:owner,method:'PUT',body:{profileStatement:'x'.repeat(2001)}})
  assert.equal(bad.statusCode,400)
  const bypass=await req(auth,'/api/auth',{who:owner,method:'PUT',
    body:{profileStatement:'Call +2348012345678 for your next job'}})
  assert.equal(bypass.statusCode,422)
  assert.equal((await pool.query('SELECT profile_statement FROM users WHERE id=$1',[owner])).rows[0].profile_statement,long)
})
test('hat requirements can be updated without rewriting its tagline',async()=>{
  const updated=await req(handler,'/api/hats/'+hatId,{who:owner,method:'PUT',
    body:{job_requirements:'Six-month steelwork deliverables and proof of relevant qualifications.'}})
  assert.equal(updated.statusCode,200,JSON.stringify(updated.body))
  const {rows}=await pool.query('SELECT motto,job_requirements FROM hats WHERE id=$1',[hatId])
  assert.equal(rows[0].motto,'Short Hat tagline')
  assert.match(rows[0].job_requirements,/steelwork/)
})
