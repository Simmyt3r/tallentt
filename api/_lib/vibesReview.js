import {query,getClient} from './db.js'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export async function pendingVibesVideos(){
  const {rows}=await query(`SELECT p.id,p.body,p.media,p.created_at,u.username,u.full_name
    FROM vibes_posts p JOIN users u ON u.id=p.author_id
    WHERE p.deleted_at IS NULL AND p.moderation_status='held'
      AND jsonb_array_length(p.media)>0
    ORDER BY p.created_at ASC LIMIT 60`)
  return {posts:rows}
}
export async function reviewVibesVideo(adminId,{post_id,decision}){
  if(!UUID.test(String(post_id||''))||!['approve','reject'].includes(decision))
    throw Object.assign(new Error('Choose a valid video and decision.'),{status:400})
  const status=decision==='approve'?'visible':'removed'
  const client=await getClient()
  try{
    await client.query('BEGIN')
    const {rows}=await client.query(`UPDATE vibes_posts SET moderation_status=$2
      WHERE id=$1 AND moderation_status='held' AND deleted_at IS NULL RETURNING id`,
      [post_id,status])
    if(!rows.length)throw Object.assign(new Error('Video no longer awaiting moderation.'),{status:409})
    await client.query(`INSERT INTO admin_audit_logs(admin_id,action,target_type,target_id,metadata)
      VALUES($1,'moderate_vibes_video','vibes_post',$2,$3::jsonb)`,
      [adminId,post_id,JSON.stringify({decision})])
    await client.query('COMMIT')
  }catch(err){await client.query('ROLLBACK').catch(()=>{});throw err}
  finally{client.release()}
  return {reviewed:true,decision}
}
