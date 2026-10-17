import {query} from './db.js'
// During staggered releases, reading a user who hasn't run the migration
// must not take Showroom, BentoField or Vibes offline.
export async function onlinePresenceExpression(ownerColumn){
  if(!['h.user_id','p.author_id','c.author_id'].includes(ownerColumn))
    throw new Error('Unapproved owner expression.')
  const {rows}=await query("SELECT to_regclass('public.user_presence') AS present")
  if(!rows[0]?.present)return 'FALSE'
  return `EXISTS(SELECT 1 FROM user_presence presence
    WHERE presence.user_id=${ownerColumn} AND presence.is_visible=TRUE
      AND presence.last_seen>NOW()-INTERVAL '90 seconds')`
}
