import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {testDatabase} from './database.mjs'

let db,pool,erasure
const admin=randomUUID(),ordinary=randomUUID(),walletUser=randomUUID(),dealUser=randomUUID()
const other=randomUUID(),hatId=randomUUID(),dealHat=randomUUID()
const asset='chombutar_hats/'+ordinary+'/temporary-upload'
before(async()=>{
  db=await testDatabase()
  pool=db.pool
  global.__tworldPool=pool
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  await pool.query(await readFile(new URL('../db/patch-admin-user-erasure-2026-10.sql',import.meta.url),'utf8'))
  for(const [id,name,adminFlag] of [
    [admin,'erasure_admin',true],[ordinary,'erasure_ordinary',false],
    [walletUser,'erasure_wallet',false],[dealUser,'erasure_deal',false],
    [other,'erasure_peer',false],
  ]){
    await pool.query("INSERT INTO users(id,username,full_name,email,password_hash,is_admin) VALUES($1,$2,$2,$3,'hash',$4)",
      [id,name,name+'@example.test',adminFlag])
  }
  await pool.query("INSERT INTO hats(id,user_id,hat_title,hat_name,username,category) VALUES($1,$2,'My gallery','My gallery','erasure_ordinary','Photography')",
    [hatId,ordinary])
  await pool.query(`INSERT INTO hat_media(hat_id,url,public_id,type)
    VALUES($1,'https://res.cloudinary.com/demo/image/upload/v1/owned.jpg',$2,'image')`,
    [hatId,asset])
  await pool.query("INSERT INTO notifications(user_id,type,title) VALUES($1,'other','Sample')",[ordinary])
  await pool.query("INSERT INTO hats(id,user_id,hat_title,hat_name,username,category) VALUES($1,$2,'Project','Project','erasure_deal','Design')",
    [dealHat,dealUser])
  erasure=await import('../api/_lib/adminUserErasure.js')
})
after(async()=>{await db?.close();delete global.__tworldPool})

test('preview rejects self-deletion and protects administrator accounts',async()=>{
  const result=await erasure.getUserErasurePreview(admin,admin)
  assert.equal(result.eligible,false)
  assert.match(result.reasons.join(' '),/your own/i)
  assert.match(result.reasons.join(' '),/administrator accounts/i)
})

test('typed confirmation is required; invalid attempts roll back',async()=>{
  const preview=await erasure.getUserErasurePreview(admin,ordinary)
  assert.equal(preview.eligible,true)
  assert.equal(preview.related.hats,1)
  await assert.rejects(erasure.eraseSubscriber(admin,{user_id:ordinary,confirmation:'DELETE user'}),{status:400})
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM users WHERE id=$1',[ordinary])).rows[0].n,1)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM hats WHERE user_id=$1',[ordinary])).rows[0].n,1)
})

test('wallet or escrow dependency blocks deletion and retains both parties financial data',async()=>{
  await pool.query("INSERT INTO wallet_transactions(user_id,type,amount,balance_after,reference) VALUES($1,'topup',1000,1000,$2)",
    [walletUser,'wallet-erasure-test'])
  const {rows:wallet}=await pool.query('SELECT user_id FROM wallets WHERE user_id=$1',[walletUser])
  await pool.query('INSERT INTO wallets(user_id,balance) VALUES($1,0) ON CONFLICT DO NOTHING',[walletUser])
  const preview=await erasure.getUserErasurePreview(admin,walletUser)
  assert.equal(preview.eligible,false)
  assert.match(preview.reasons.join(' '),/Wallet transactions/i)
  await assert.rejects(erasure.eraseSubscriber(admin,{
    user_id:walletUser,confirmation:'DELETE @erasure_wallet',
  }),{status:409})
  await pool.query("INSERT INTO escrows(hat_id,client_id,talent_id,amount,status) VALUES($1,$2,$3,1000,'not_funded')",
    [dealHat,other,dealUser])
  const affected=await erasure.getUserErasurePreview(admin,dealUser)
  assert.equal(affected.eligible,false)
  assert.match(affected.reasons.join(' '),/booking or escrow/i)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM escrows')).rows[0].n,1)
})

test('erasure removes owner, hats, notifications, media and records minimal audit and media-cleanup jobs',async()=>{
  delete process.env.CLOUDINARY_CLOUD_NAME
  delete process.env.CLOUDINARY_API_KEY
  delete process.env.CLOUDINARY_API_SECRET
  const result=await erasure.eraseSubscriber(admin,{
    user_id:ordinary,confirmation:'DELETE @erasure_ordinary',
  })
  assert.equal(result.deleted,true)
  assert.equal(result.media_jobs_created,1)
  assert.equal(result.media_cleanup.configured,false)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM users WHERE id=$1',[ordinary])).rows[0].n,0)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM hats WHERE id=$1',[hatId])).rows[0].n,0)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id=$1',[ordinary])).rows[0].n,0)
  const {rows:queued}=await pool.query('SELECT public_id,status,resource_type FROM admin_user_media_erasure_jobs WHERE deleted_user_id=$1',[ordinary])
  assert.equal(queued.length,1)
  assert.deepEqual([queued[0].public_id,queued[0].status,queued[0].resource_type],[asset,'pending','image'])
  const {rows:audit}=await pool.query("SELECT action,metadata FROM admin_audit_logs WHERE target_id=$1",[ordinary])
  assert.equal(audit.length,1)
  assert.equal(audit[0].action,'erase_subscriber')
  assert.ok(!JSON.stringify(audit[0].metadata).includes('erasure_ordinary'))
  await assert.rejects(erasure.getUserErasurePreview(admin,ordinary),{status:404})
})
