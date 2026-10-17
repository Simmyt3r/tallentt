import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {Readable} from 'node:stream'
import {readFile} from 'node:fs/promises'
import {testDatabase} from './database.mjs'

let db,pool,erasure,handler,signSession
const admin=randomUUID(),ordinary=randomUUID(),walletUser=randomUUID(),dealUser=randomUUID()
const other=randomUUID(),hatId=randomUUID(),dealHat=randomUUID(),vibeId=randomUUID(),otherVibeId=randomUUID()
const asset='chombutar_hats/'+ordinary+'/temporary-upload'
before(async()=>{
  db=await testDatabase()
  pool=db.pool
  global.__tworldPool=pool
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  await pool.query(await readFile(new URL('../db/patch-admin-user-erasure-2026-10.sql',import.meta.url),'utf8'))
  await pool.query(await readFile(new URL('../db/patch-showroom-gallery-2026-10.sql',import.meta.url),'utf8'))
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
  await pool.query("INSERT INTO vibes_posts(id,author_id,body) VALUES($1,$2,'Entertainment performance')",
    [vibeId,ordinary])
  await pool.query("INSERT INTO vibes_posts(id,author_id,body) VALUES($1,$2,'Other profile')",
    [otherVibeId,other])
  await pool.query("INSERT INTO vibes_comments(post_id,author_id,body) VALUES($1,$2,'Nice work')",
    [vibeId,other])
  await pool.query("INSERT INTO vibes_comments(post_id,author_id,body) VALUES($1,$2,'Thanks')",
    [otherVibeId,ordinary])
  await pool.query(`INSERT INTO showroom_gallery_posts
      (author_id,public_id,media_url,media_type,caption)
      VALUES($1,$2,'https://res.cloudinary.com/demo/image/upload/v1/gallery.jpg','image','My gallery')`,
    [ordinary,'chombutar_hats/'+ordinary+'/gallery'])

  await pool.query("INSERT INTO hats(id,user_id,hat_title,hat_name,username,category) VALUES($1,$2,'Project','Project','erasure_deal','Design')",
    [dealHat,dealUser])
  erasure=await import('../api/_lib/adminUserErasure.js')
  process.env.JWT_SECRET='account-erasure-test-secret-only'
  signSession=(await import('../api/_lib/auth.js')).signSession
  handler=(await import('../api/admin/index.js')).default
})
after(async()=>{await db?.close();delete global.__tworldPool})

async function http({who=admin,method='GET',action='user_erasure_preview',target=ordinary,
  confirmation=''}={}){
  const body=method==='POST'?{
    action:'erase_subscriber',user_id:target,confirmation,
  }:null
  const stream=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[])
  Object.assign(stream,{method,url:method==='GET'
      ?'/api/admin?action='+action+'&user_id='+target:'/api/admin',
    headers:{host:'localhost',cookie:who?'cw_session='+signSession({sub:who}):''}})
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},
    end(value){this.body=JSON.parse(value)}}
  await handler(stream,res)
  return res
}

test('Admin API forbids anonymous and ordinary subscribers from preview or deletion',async()=>{
  assert.equal((await http({who:null})).statusCode,401)
  assert.equal((await http({who:other})).statusCode,403)
  assert.equal((await http({who:other,method:'POST',confirmation:'DELETE @erasure_ordinary'})).statusCode,403)
  assert.equal((await http({who:admin,method:'GET'})).statusCode,200)
  assert.equal((await http({who:admin,method:'POST',confirmation:'DELETE @somebody'})).statusCode,400)
})

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
  assert.equal(preview.related.social_posts,2)
  await assert.rejects(erasure.eraseSubscriber(admin,{user_id:ordinary,confirmation:'DELETE user'}),{status:400})
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM users WHERE id=$1',[ordinary])).rows[0].n,1)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM hats WHERE user_id=$1',[ordinary])).rows[0].n,1)
})

test('wallet or escrow dependency blocks deletion and retains both parties financial data',async()=>{
  await pool.query("INSERT INTO wallet_transactions(user_id,type,amount,balance_after,reference) VALUES($1,'topup',1000,1000,$2)",
    [walletUser,'wallet-erasure-test'])
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
  assert.equal(result.media_jobs_created,2)
  assert.equal(result.media_cleanup.configured,false)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM users WHERE id=$1',[ordinary])).rows[0].n,0)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM hats WHERE id=$1',[hatId])).rows[0].n,0)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id=$1',[ordinary])).rows[0].n,0)
  const {rows:queued}=await pool.query('SELECT public_id,status,resource_type FROM admin_user_media_erasure_jobs WHERE deleted_user_id=$1',[ordinary])
  assert.equal(queued.length,2)
  assert.ok(queued.some(item => item.public_id===asset&&item.status==='pending'&&item.resource_type==='image'))
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM vibes_posts WHERE id=$1',[vibeId])).rows[0].n,0)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM vibes_comments WHERE author_id=$1',[ordinary])).rows[0].n,0)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM vibes_posts WHERE id=$1',[otherVibeId])).rows[0].n,1)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM showroom_gallery_posts WHERE author_id=$1',[ordinary])).rows[0].n,0)
  const {rows:audit}=await pool.query("SELECT action,metadata FROM admin_audit_logs WHERE target_id=$1",[ordinary])
  assert.equal(audit.length,1)
  assert.equal(audit[0].action,'erase_subscriber')
  assert.ok(!JSON.stringify(audit[0].metadata).includes('erasure_ordinary'))
  await assert.rejects(erasure.getUserErasurePreview(admin,ordinary),{status:404})
})
