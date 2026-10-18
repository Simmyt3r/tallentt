import {query,getClient} from './db.js'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export async function pendingVibesVideos(){
  const {rows}=await query(`SELECT p.id,p.body,p.media,p.created_at,p.moderation_status,
    u.username,u.full_name,
    (SELECT COUNT(*)::int FROM vibes_reports r WHERE r.post_id=p.id) AS report_count,
    (SELECT jsonb_agg(r.reason ORDER BY r.created_at DESC) FROM vibes_reports r
      WHERE r.post_id=p.id) AS report_reasons
    FROM vibes_posts p JOIN users u ON u.id=p.author_id
    WHERE p.deleted_at IS NULL AND
      ((p.moderation_status='held' AND jsonb_array_length(p.media)>0)
       OR (p.moderation_status='visible' AND EXISTS(SELECT 1 FROM vibes_reports r WHERE r.post_id=p.id)))
    ORDER BY (p.moderation_status='visible') DESC,p.created_at ASC LIMIT 60`)
  return {posts:rows}
}

export async function reviewVibesVideo(adminId,{post_id,decision}){
  if(!UUID.test(String(post_id||''))||!['approve','reject','dismiss'].includes(decision))
    throw Object.assign(new Error('Choose a valid post and decision.'),{status:400})
  const client=await getClient()
  try{
    await client.query('BEGIN')
    const {rows:locked}=await client.query(`SELECT id,moderation_status FROM vibes_posts
      WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,[post_id])
    const post=locked[0]
    if(!post)throw Object.assign(new Error('Post unavailable.'),{status:404})
    if(decision==='dismiss'){
      const {rowCount}=await client.query('DELETE FROM vibes_reports WHERE post_id=$1',[post_id])
      if(!rowCount)throw Object.assign(new Error('No reports to dismiss.'),{status:409})
    }else{
      if(decision==='approve'&&post.moderation_status!=='held')
        throw Object.assign(new Error('Only pending media may be approved.'),{status:409})
      const next=decision==='approve'?'visible':'removed'
      await client.query('UPDATE vibes_posts SET moderation_status=$2 WHERE id=$1',[post_id,next])
      if(decision==='reject')await client.query('DELETE FROM vibes_reports WHERE post_id=$1',[post_id])
    }
    await client.query(`INSERT INTO admin_audit_logs(admin_id,action,target_type,target_id,metadata)
      VALUES($1,'moderate_vibes_video','vibes_post',$2,$3::jsonb)`,
      [adminId,post_id,JSON.stringify({decision})])
    await client.query('COMMIT')
  }catch(err){await client.query('ROLLBACK').catch(()=>{});throw err}
  finally{client.release()}
  return {reviewed:true,decision}
}
