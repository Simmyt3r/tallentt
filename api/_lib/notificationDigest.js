import { query } from './db.js'
import { ensurePushStorage,sendDigestPush } from './pushNotifications.js'

// One daily production run. Only unread, consequential Fame activity is
// included. Likes, views and generic prompts never enter this query.
export async function dispatchDailyFameDigests(){
  await ensurePushStorage()
  const day=new Date().toISOString().slice(0,10)
  const started=Date.now()
  const {rows}=await query(`SELECT n.user_id,
      COUNT(*) FILTER (WHERE n.type LIKE 'vibes_%')::int AS vibes_count,
      COUNT(*) FILTER (WHERE n.type NOT LIKE 'vibes_%')::int AS fame_count
    FROM notifications n
    LEFT JOIN notification_preferences p ON p.user_id=n.user_id
    WHERE n.created_at>=NOW()-INTERVAL '24 hours'
      AND n.read_at IS NULL AND n.deleted_at IS NULL
      AND (n.type ~ '^(showroom_|orbit_|verification_|hat_moderation)'
        OR (n.type LIKE 'vibes_%' AND COALESCE(p.vibes_mode,'digest')='digest'))
      AND EXISTS(SELECT 1 FROM push_subscriptions ps WHERE ps.user_id=n.user_id)
    GROUP BY n.user_id
    ORDER BY n.user_id
    LIMIT 100`)
  let delivered=0, claimed=0, failed=0
  // Each claim is unique per recipient/day. Parallel cron invocations cannot
  // send the same user's digest twice.
  for(let i=0;i<rows.length;i+=5){
    if(Date.now()-started>40000)break
    const batch=rows.slice(i,i+5)
    await Promise.allSettled(batch.map(async item=>{
      const {rows:claim}=await query(`INSERT INTO notification_daily_digests
        (user_id,digest_day,status) VALUES($1,$2,'sending')
        ON CONFLICT DO NOTHING RETURNING user_id`,[item.user_id,day])
      if(!claim.length)return
      claimed++
      const parts=[]
      if(item.fame_count)parts.push(`${item.fame_count} Showroom, Orbit or verification updates`)
      if(item.vibes_count)parts.push(`${item.vibes_count} Vibes & Hits updates`)
      const result=await sendDigestPush(item.user_id,{
        day,title:'Your ChombuTar daily digest',body:parts.join(' · '),
      }).catch(()=>({delivered:0}))
      if(result.delivered>0){
        delivered++
        await query(`UPDATE notification_daily_digests SET status='sent',sent_at=NOW()
          WHERE user_id=$1 AND digest_day=$2`,[item.user_id,day])
      }else{
        failed++
        // A transient VAPID error or absent subscription should not
        // permanently consume today's only digest opportunity.
        await query(`DELETE FROM notification_daily_digests
          WHERE user_id=$1 AND digest_day=$2 AND status='sending'`,[item.user_id,day])
      }
    }))
  }
  return {processed:rows.length,claimed,delivered,failed,limited:rows.length===100||claimed<rows.length}
}
