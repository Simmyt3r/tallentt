// Database integration: Gold eligibility must be enforced with completed
// escrows and real active, screened Hat media. UI mocks cannot prove this.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { testDatabase } from './database.mjs'

let database,pool,top12,ids
before(async()=>{
  database=await testDatabase()
  pool=database.pool
  global.__tworldPool=pool
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  const gold=randomUUID(),bronze=randomUUID(),customer=randomUUID()
  const goldHat=randomUUID(),bronzeHat=randomUUID()
  ids={gold,bronze,customer,goldHat,bronzeHat}
  for(const [id,name,role] of [[gold,'gold_talent','talent'],[bronze,'bronze_talent','talent'],[customer,'customer','client']]){
    await pool.query(`INSERT INTO users
      (id,username,full_name,email,password_hash,role,avatar_url,bio,skills,location,country,created_at)
      VALUES($1,$2,$2,$3,'testhash',$4,'https://example.test/a.jpg','Experienced creator',
        ARRAY['Video production'],'Lagos','Nigeria','2020-01-01')`,
      [id,name,name+'@example.test',role])
  }
  for(const [id,owner,name] of [[goldHat,gold,'Gold videography'],[bronzeHat,bronze,'Bronze videography']]){
    await pool.query(`INSERT INTO hats (id,user_id,hat_title,hat_name,username,category,role,is_verified,active,feed_visible)
      VALUES ($1,$2,$3,$3,$4,'Film','talent',TRUE,TRUE,TRUE)`,
      [id,owner,name,owner===gold?'gold_talent':'bronze_talent'])
    await pool.query(`INSERT INTO hat_media (hat_id,url,public_id,type,caption,screening_status)
      VALUES($1,$2,$3,'image','Completed event video','passed')`,
      [id,'https://res.cloudinary.com/demo/image/upload/'+id+'.jpg','test/'+id])
  }
  for(const [owner,hat,count] of [[gold,goldHat,10],[bronze,bronzeHat,3]]){
    for(let i=0;i<count;i++){
      await pool.query(`INSERT INTO escrows
        (hat_id,client_id,talent_id,amount,status,work_status,funded_at,released_at)
        VALUES ($1,$2,$3,10000,'released','completed',NOW(),NOW())`,[hat,customer,owner])
    }
  }
  top12=await import('../api/_lib/workPassTop12.js')
})
after(async()=>{await database?.close();delete global.__tworldPool})

test('Top 12 includes only Gold talent backed by ten released, completed escrows',async()=>{
  const result=await top12.getGoldTop12(ids.customer)
  assert.equal(result.view,'top12')
  assert.equal(result.hats.length,1)
  assert.equal(result.hats[0].id,ids.goldHat)
  assert.equal(result.hats[0].work_pass_tier,'Gold')
  assert.ok(result.hats[0].work_pass_orbit>=65)
  assert.equal(result.hats[0].top12_rank,1)
})
test('held media immediately disqualifies a formerly Gold Top 12 Hat',async()=>{
  await pool.query("UPDATE hat_media SET screening_status='held' WHERE hat_id=$1",[ids.goldHat])
  const result=await top12.getGoldTop12(ids.customer)
  assert.equal(result.hats.length,0)
})
