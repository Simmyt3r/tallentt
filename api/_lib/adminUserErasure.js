// Account erasure is deliberately strict: no escrow, wallet ledger or cash-flow
// data can disappear from another participant's deal or financial reconciliation.
// All relational changes are atomic; external Cloudinary cleanup is queued.
import {v2 as cloudinary} from 'cloudinary'
import {query,getClient} from './db.js'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const bad=(status,message)=>Object.assign(new Error(message),{status})
const validId=id=>{if(!UUID.test(String(id||'')))throw bad(400,'Invalid subscriber ID.');return id}
const ident=s=>'"'+String(s).replace(/"/g,'""')+'"'
const safeTable=s=>String(s).split('.').map(ident).join('.')
const MAX_CLEANUP=8

async function exists(client,name){
  const {rows}=await client.query('SELECT to_regclass($1) AS reg',[name])
  return !!rows[0]?.reg
}
async function count(client,sql,args){
  const {rows}=await client.query(sql,args)
  return Number(rows[0]?.n||0)
}
async function optionalCount(client,table,sql,args){
  return await exists(client,table)?count(client,sql,args):0
}
async function ensureQueue(client){
  if(!await exists(client,'admin_user_media_erasure_jobs'))
    throw bad(503,'Apply the Admin account deletion migration first.')
}

async function overview(client,id,adminId,{lock=false}={}){
  validId(id)
  await ensureQueue(client)
  const {rows}=await client.query(`SELECT id,username,is_admin,created_at
    FROM users WHERE id=$1 ${lock?'FOR UPDATE':''}`,[id])
  const person=rows[0]
  if(!person)throw bad(404,'Subscriber not found.')
  const {rows:wallet}=await client.query('SELECT COALESCE(balance,0) AS balance FROM wallets WHERE user_id=$1',[id])
  const ledger=await count(client,'SELECT COUNT(*)::int AS n FROM wallet_transactions WHERE user_id=$1',[id])
  const deals=await count(client,`SELECT COUNT(*)::int AS n FROM escrows e
    WHERE e.client_id=$1 OR e.talent_id=$1
       OR EXISTS(SELECT 1 FROM hats h WHERE h.id=e.hat_id AND h.user_id=$1)`,[id])
  const cashLive=await optionalCount(client,'live_bets',
    'SELECT COUNT(*)::int AS n FROM live_bets WHERE user_id=$1 OR backing_user_id=$1',[id])
    +await optionalCount(client,'live_gifts',
      'SELECT COUNT(*)::int AS n FROM live_gifts WHERE sender_id=$1',[id])
    +await optionalCount(client,'live_sponsor_slots',
      'SELECT COUNT(*)::int AS n FROM live_sponsor_slots WHERE sponsor_id=$1',[id])
    +await optionalCount(client,'live_rooms',
      "SELECT COUNT(*)::int AS n FROM live_rooms WHERE (host_id=$1 OR winner_id=$1 OR invited_user_id=$1) AND COALESCE(stake,0)>0",[id])
  const adminCount=person.is_admin?await count(client,'SELECT COUNT(*)::int AS n FROM users WHERE is_admin=TRUE'):0
  const hatCount=await count(client,'SELECT COUNT(*)::int AS n FROM hats WHERE user_id=$1',[id])
  const social=await optionalCount(client,'vibes_posts','SELECT COUNT(*)::int AS n FROM vibes_posts WHERE author_id=$1',[id])
   +await optionalCount(client,'showroom_gallery_posts','SELECT COUNT(*)::int AS n FROM showroom_gallery_posts WHERE author_id=$1',[id])
  const messages=await optionalCount(client,'notifications','SELECT COUNT(*)::int AS n FROM notifications WHERE user_id=$1',[id])
  const reasons=[]
  if(id===adminId)reasons.push('You cannot delete your own administrator account.')
  if(person.is_admin)reasons.push('Administrator accounts cannot be deleted here; revoke administrator access through a separate approved procedure.')
  if(person.is_admin&&adminCount<=1)reasons.push('The final administrator must remain.')
  if(Number(wallet[0]?.balance||0)!==0)reasons.push('Wallet balance is not zero. Settle or return funds first.')
  if(ledger)reasons.push('Wallet transactions exist and require financial retention and reconciliation.')
  if(deals)reasons.push('The account has booking or escrow records, including transactions belonging to other users.')
  if(cashLive)reasons.push('The account has live financial activity that must be reconciled and retained.')
  return {
    user:{id:person.id,username:person.username,is_admin:person.is_admin,created_at:person.created_at},
    eligible:reasons.length===0,reasons,
    related:{hats:hatCount,social_posts:social,notifications:messages,
      escrow_records:deals,wallet_transactions:ledger,live_financial_events:cashLive},
    wallet_balance:Number(wallet[0]?.balance||0),
    external_media:'Cloudinary uploads are queued and deleted separately. Until cleanup succeeds, deletion is not fully complete.',
  }
}

// Gather owned assets, including unclaimed signed uploads, before deleting
// rows. In particular, never destroy a reusable file owned by another account.
async function ownedAssets(client,id){
  const assets=new Map()
  const add=(publicId,type)=>{
    if(typeof publicId!=='string'||!publicId.trim()||publicId.length>255)return
    const resourceType=type==='video'?'video':type==='raw'?'raw':'image'
    assets.set(resourceType+':'+publicId,{publicId,resourceType})
  }
  if(await exists(client,'hat_media')){
    const {rows}=await client.query(`SELECT m.public_id,m.type FROM hat_media m JOIN hats h ON h.id=m.hat_id
      WHERE h.user_id=$1 AND m.public_id IS NOT NULL`,[id])
    rows.forEach(r=>add(r.public_id,r.type))
  }
  for(const [table,sql] of [
    ['hat_media_upload_permits','SELECT public_id,resource_type AS type FROM hat_media_upload_permits WHERE user_id=$1'],
    ['vibes_upload_permits',"SELECT public_id,'image' AS type FROM vibes_upload_permits WHERE user_id=$1"],
    ['showroom_gallery_posts','SELECT public_id,media_type AS type FROM showroom_gallery_posts WHERE author_id=$1'],
  ]){
    if(await exists(client,table)){
      const {rows}=await client.query(sql,[id]);rows.forEach(r=>add(r.public_id,r.type))
    }
  }
  if(await exists(client,'vibes_posts')){
    const {rows}=await client.query('SELECT media FROM vibes_posts WHERE author_id=$1',[id])
    rows.forEach(r=>(Array.isArray(r.media)?r.media:[]).forEach(item=>add(item.public_id,item.type)))
  }
  // Defensive check: do not remove an asset attached to somebody else's Hat
  // or standalone Showcase even if the target copied its public ID.
  const exclusive=[]
  for(const asset of assets.values()){
    const {rows:otherHats}=await client.query(`SELECT 1 FROM hat_media m JOIN hats h ON h.id=m.hat_id
      WHERE m.public_id=$1 AND h.user_id<>$2 LIMIT 1`,[asset.publicId,id])
    if(otherHats.length)continue
    if(await exists(client,'vibes_posts')){
      const {rows:otherVibes}=await client.query(`SELECT 1 FROM vibes_posts post,
        LATERAL jsonb_array_elements(post.media) asset
        WHERE post.author_id<>$2 AND asset->>'public_id'=$1 LIMIT 1`,
        [asset.publicId,id])
      if(otherVibes.length)continue
    }
    if(await exists(client,'showroom_gallery_posts')){
      const {rows:other}=await client.query(`SELECT 1 FROM showroom_gallery_posts
        WHERE public_id=$1 AND author_id<>$2 LIMIT 1`,[asset.publicId,id])
      if(other.length)continue
    }
    exclusive.push(asset)
  }
  return exclusive
}

// Public catalog introspection means future user-owned tables with a direct FK
// are also considered. Restrictive foreign keys that cannot be safely handled
// abort the entire transaction instead of producing a half-deleted account.
async function eraseUserReferences(client,id){
  const {rows}=await client.query(`SELECT
    ns.nspname AS schema_name, rel.relname AS table_name,
    col.attname AS column_name, fk.confdeltype
    FROM pg_constraint fk
    JOIN pg_class rel ON rel.oid=fk.conrelid
    JOIN pg_namespace ns ON ns.oid=rel.relnamespace
    JOIN pg_attribute col ON col.attrelid=fk.conrelid AND col.attnum=fk.conkey[1]
    WHERE fk.contype='f' AND fk.confrelid='public.users'::regclass
      AND array_length(fk.conkey,1)=1 AND ns.nspname='public'`)
  const deletions=new Map()
  for(const fk of rows){
    if(fk.table_name==='users')continue
    if(fk.confdeltype==='n')continue // SET NULL: retains shared admin history
    // Shared lookup data survives; only its nullable creator pointer is cleared.
    if((fk.table_name==='categories'&&fk.column_name==='created_by') ||
       (fk.table_name==='live_games'&&fk.column_name==='owner_id')){
      await client.query(`UPDATE ${safeTable(fk.schema_name+'.'+fk.table_name)}
        SET ${ident(fk.column_name)}=NULL WHERE ${ident(fk.column_name)}=$1`,[id])
      continue
    }
    const table=fk.schema_name+'.'+fk.table_name
    if(!deletions.has(table))deletions.set(table,new Set())
    deletions.get(table).add(fk.column_name)
  }
  // Child tables first, parent tables last. Most FKs to these tables are
  // CASCADE already; this ordering also handles RESTRICT dependencies.
  const {rows:dependencies}=await client.query(`SELECT
    ns1.nspname||'.'||c1.relname AS child,
    ns2.nspname||'.'||c2.relname AS parent
    FROM pg_constraint fk
    JOIN pg_class c1 ON c1.oid=fk.conrelid
    JOIN pg_namespace ns1 ON ns1.oid=c1.relnamespace
    JOIN pg_class c2 ON c2.oid=fk.confrelid
    JOIN pg_namespace ns2 ON ns2.oid=c2.relnamespace
    WHERE fk.contype='f' AND ns1.nspname='public' AND ns2.nspname='public'`)
  const sorted=[];const seen=new Set()
  function visit(table){
    if(seen.has(table))return
    seen.add(table)
    for(const edge of dependencies)if(edge.parent===table&&deletions.has(edge.child))visit(edge.child)
    sorted.push(table)
  }
  for(const table of deletions.keys())visit(table)
  for(const table of sorted){
    const columns=[...deletions.get(table)]
    const condition=columns.map((col,i)=>ident(col)+'=$1').join(' OR ')
    await client.query(`DELETE FROM ${safeTable(table)} WHERE ${condition}`,[id])
  }
}

export async function getUserErasurePreview(adminId,userId){
  const client=await getClient()
  try{return await overview(client,validId(userId),adminId)}
  finally{client.release()}
}

export async function eraseSubscriber(adminId,{user_id,confirmation}={}){
  validId(user_id)
  const client=await getClient()
  let result
  try{
    await client.query('BEGIN')
    // Lock the account row. New FK rows are serialized against deletion.
    const preview=await overview(client,user_id,adminId,{lock:true})
    if(!preview.eligible)throw bad(409,preview.reasons.join(' '))
    if(confirmation!==`DELETE @${preview.user.username}`)
      throw bad(400,'Type the exact confirmation shown: DELETE @'+preview.user.username)
    const assets=await ownedAssets(client,user_id)
    for(const asset of assets){
      await client.query(`INSERT INTO admin_user_media_erasure_jobs(deleted_user_id,public_id,resource_type)
        VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
      [user_id,asset.publicId,asset.resourceType])
    }
    await eraseUserReferences(client,user_id)
    const {rowCount}=await client.query('DELETE FROM users WHERE id=$1',[user_id])
    if(rowCount!==1)throw bad(409,'Subscriber was not deleted.')
    await client.query(`INSERT INTO admin_audit_logs
      (admin_id,action,target_type,target_id,metadata) VALUES
      ($1,'erase_subscriber','user',$2,$3::jsonb)`,
      [adminId,user_id,JSON.stringify({related_counts:preview.related,media_jobs:assets.length})])
    await client.query('COMMIT')
    result={deleted:true,username:preview.user.username,
      media_jobs_created:assets.length,financial_records_deleted:0}
  }catch(error){
    await client.query('ROLLBACK').catch(()=>{})
    if(error.code==='23503')throw bad(409,'Related records prevent deletion. Resolve linked platform activity before retrying.')
    throw error
  }finally{client.release()}
  // Best-effort post-commit cleanup; durable jobs remain for admin retry.
  try{result.media_cleanup=await processErasureMediaQueue({limit:MAX_CLEANUP})}
  catch(error){result.media_cleanup={pending:true,reason:'Cloud media cleanup requires retry.'}}
  return result
}

export async function mediaErasureStatus(){
  const {rows}=await query(`SELECT COUNT(*)::int AS pending,
    COUNT(*) FILTER (WHERE status='failed')::int AS failed
    FROM admin_user_media_erasure_jobs`)
  return rows[0]||{pending:0,failed:0}
}

export async function processErasureMediaQueue({limit=MAX_CLEANUP}={}){
  const cloudName=process.env.CLOUDINARY_CLOUD_NAME
  const apiKey=process.env.CLOUDINARY_API_KEY
  const apiSecret=process.env.CLOUDINARY_API_SECRET
  if(!cloudName||!apiKey||!apiSecret)
    return {...await mediaErasureStatus(),configured:false,
      warning:'Cloudinary credentials are missing; external erasure jobs remain pending.'}
  cloudinary.config({cloud_name:cloudName,api_key:apiKey,api_secret:apiSecret,secure:true})
  const {rows}=await query(`SELECT id,public_id,resource_type FROM admin_user_media_erasure_jobs
    ORDER BY created_at,id LIMIT $1`,[Math.min(MAX_CLEANUP,Math.max(1,Number(limit)||1))])
  let removed=0
  for(const item of rows){
    try{
      const response=await cloudinary.uploader.destroy(item.public_id,{
        resource_type:item.resource_type,invalidate:true,
      })
      if(response?.result==='ok'||response?.result==='not found'){
        await query('DELETE FROM admin_user_media_erasure_jobs WHERE id=$1',[item.id])
        removed++
      }else throw new Error('Cloudinary did not confirm deletion.')
    }catch(error){
      await query(`UPDATE admin_user_media_erasure_jobs SET status='failed',
        attempts=attempts+1,last_error=$2,updated_at=NOW() WHERE id=$1`,
        [item.id,String(error?.message||'Provider failure').slice(0,180)])
    }
  }
  return {...await mediaErasureStatus(),removed,configured:true}
}
