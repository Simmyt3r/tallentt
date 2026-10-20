import { query, getClient } from './db.js'
import { notifyUser } from './notifications.js'
import { accountOrbit } from './accountOrbit.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const fail = (status,message) => Object.assign(new Error(message),{status})
const valid = value => UUID.test(String(value||''))
const policies = new Set(['everyone','verified_talents','nobody'])

async function requireInstalled(){
  const {rows}=await query("SELECT to_regclass('associate_links') AS connections, to_regclass('subscriber_follows') AS follows")
  if(!rows[0]?.connections||!rows[0]?.follows)throw fail(503,'Apply the Associates & Inbox migration in Admin first.')
}
const name = value => String(value||'').trim().replace(/^[@^]+/,'').slice(0,30)
const pair = (a,b) => a < b ? [a,b] : [b,a]

async function lookupProfile(username){
  const clean=name(username)
  if(!clean)throw fail(400,'Choose a valid subscriber.')
  const {rows}=await query('SELECT id,username,full_name,role FROM users WHERE LOWER(username)=LOWER($1) LIMIT 1',[clean])
  if(!rows.length)throw fail(404,'Subscriber not found.')
  return rows[0]
}

export async function associatesGet(viewerId,params){
  await requireInstalled()
  if(params.get('associate_privacy')==='1'){
    const {rows}=await query('SELECT who_can_request FROM associate_settings WHERE user_id=$1',[viewerId])
    return {privacy:rows[0]?.who_can_request||'everyone'}
  }
  const target=await lookupProfile(params.get('associates'))
  const own=viewerId===target.id
  const [counts,relation,privacy,people,incoming]=await Promise.all([
    query(`SELECT
      (SELECT COUNT(*)::int FROM associate_links
        WHERE status='accepted' AND (member_low=$1 OR member_high=$1)) AS associates,
      (SELECT COUNT(*)::int FROM subscriber_follows WHERE followed_id=$1) AS subscribers`,[target.id]),
    own?Promise.resolve({rows:[]}):query(`SELECT status,requester_id,member_low,member_high,vouched_by_low,vouched_by_high
      FROM associate_links WHERE member_low=LEAST($1::uuid,$2::uuid)
        AND member_high=GREATEST($1::uuid,$2::uuid) LIMIT 1`,[viewerId,target.id]),
    own?query('SELECT who_can_request FROM associate_settings WHERE user_id=$1',[viewerId]):Promise.resolve({rows:[]}),
    query(`SELECT l.id,l.accepted_at,
        CASE WHEN l.member_low=$1 THEN l.vouched_by_high ELSE l.vouched_by_low END AS received_vouch,
        CASE WHEN l.member_low=$1 THEN l.vouched_by_low ELSE l.vouched_by_high END AS gave_vouch,
        u.id AS peer_id,u.username,u.full_name,u.avatar_url,u.skills,
        u.role, u.headline
      FROM associate_links l JOIN users u
        ON u.id=CASE WHEN l.member_low=$1 THEN l.member_high ELSE l.member_low END
      WHERE l.status='accepted' AND (l.member_low=$1 OR l.member_high=$1)
      ORDER BY l.accepted_at DESC,l.id DESC LIMIT 12`,[target.id]),
    own?query(`SELECT l.id,l.requester_id,u.username,u.full_name,u.avatar_url
      FROM associate_links l JOIN users u ON u.id=l.requester_id
      WHERE (l.member_low=$1 OR l.member_high=$1)
        AND l.status='pending' AND l.requester_id<>$1
      ORDER BY l.created_at DESC LIMIT 24`,[viewerId]):Promise.resolve({rows:[]}),
  ])
  const follow=own?false:(await query('SELECT 1 FROM subscriber_follows WHERE follower_id=$1 AND followed_id=$2',[viewerId,target.id])).rows.length>0
  const relationRow=relation.rows[0]||null
  // This list is deliberately bounded: Orbit is calculated from real activity,
  // not from an unverified "associate" badge. No synthetic scores are created.
  const rows=await Promise.all(people.rows.map(async person=>{
    const score=await accountOrbit(person.peer_id).then(x=>x.score).catch(()=>null)
    return {...person,orbit_score:score}
  }))
  return {
    user_id:target.id,counts:counts.rows[0],
    relation:relationRow?{
      status:relationRow.status,
      incoming:relationRow.status==='pending'&&relationRow.requester_id!==viewerId,
      outgoing:relationRow.status==='pending'&&relationRow.requester_id===viewerId,
      vouched_by_me:relationRow.member_low===viewerId?relationRow.vouched_by_low:relationRow.vouched_by_high,
    }:null,
    following:follow,
    privacy:own?privacy.rows[0]?.who_can_request||'everyone':null,
    associates:rows,
    incoming:incoming.rows,
  }
}

export async function associatesAction(userId,body){
  await requireInstalled()
  const action=String(body?.action||'')
  if(action==='associate_privacy'){
    if(!policies.has(body.policy))throw fail(400,'Choose an Associate request privacy setting.')
    await query(`INSERT INTO associate_settings(user_id,who_can_request) VALUES($1,$2)
      ON CONFLICT(user_id) DO UPDATE SET who_can_request=EXCLUDED.who_can_request`,[userId,body.policy])
    return {privacy:body.policy}
  }
  const other=String(body?.other_id||'')
  if(!valid(other)||other===userId)throw fail(400,'Select another subscriber.')
  const [lo,hi]=pair(userId,other)
  if(action==='associate_follow'||action==='associate_unfollow'){
    if(action==='associate_follow'){
      const {rows:rate}=await query(`SELECT COUNT(*)::int AS n FROM subscriber_follows
        WHERE follower_id=$1 AND created_at>NOW()-INTERVAL '24 hours'`,[userId])
      if(rate[0].n>=60)throw fail(429,'You have followed many accounts today.')
      const {rowCount}=await query(`INSERT INTO subscriber_follows(follower_id,followed_id)
        SELECT $1,id FROM users WHERE id=$2 ON CONFLICT DO NOTHING`,[userId,other])
      if(!rowCount)throw fail(409,'Subscriber unavailable or already followed.')
    }else{
      await query('DELETE FROM subscriber_follows WHERE follower_id=$1 AND followed_id=$2',[userId,other])
    }
    return {ok:true}
  }
  if(action==='associate_request'){
    const {rows:recipient}=await query(`SELECT u.id,COALESCE(s.who_can_request,'everyone') AS policy
      FROM users u LEFT JOIN associate_settings s ON s.user_id=u.id WHERE u.id=$1`,[other])
    if(!recipient[0])throw fail(404,'Subscriber unavailable.')
    if(recipient[0].policy==='nobody')throw fail(403,'This subscriber is not receiving Associate requests.')
    if(recipient[0].policy==='verified_talents'){
      const {rows:verified}=await query(`SELECT 1 FROM users u WHERE u.id=$1
        AND u.role IN ('talent','dual')
        AND EXISTS(SELECT 1 FROM hats h WHERE h.user_id=u.id AND h.is_verified=TRUE AND h.active=TRUE)`,[userId])
      if(!verified.length)throw fail(403,'Only verified talents may request this Associate connection.')
    }
    const {rows:rate}=await query(`SELECT COUNT(*)::int AS n FROM associate_links
      WHERE requester_id=$1 AND created_at>NOW()-INTERVAL '24 hours'`,[userId])
    if(rate[0].n>=12)throw fail(429,'Associate request limit reached for today.')
    const {rows}=await query(`INSERT INTO associate_links(member_low,member_high,requester_id)
      VALUES($1,$2,$3)
      ON CONFLICT(member_low,member_high) DO UPDATE SET
        requester_id=EXCLUDED.requester_id,status='pending',
        vouched_by_low=FALSE,vouched_by_high=FALSE,accepted_at=NULL,
        created_at=NOW(),updated_at=NOW()
      WHERE associate_links.status IN ('declined','removed')
        AND associate_links.updated_at < NOW()-INTERVAL '7 days'
      RETURNING id`,[lo,hi,userId])
    if(!rows.length)throw fail(409,'An Associate request or active relationship already exists. Blocked requests cannot be renewed.')
    await notifyUser({userId:other,type:'associate_request',title:'New Associate request',
      body:'Someone would like to connect professionally.',linkUrl:'/profile?tab=associates',
      metadata:{other_id:userId}})
    return {status:'pending'}
  }
  if(!['associate_accept','associate_decline','associate_block','associate_remove','associate_vouch','associate_unvouch'].includes(action))
    throw fail(400,'Unknown Associate action.')
  const client=await getClient()
  let updated
  try{
    await client.query('BEGIN')
    const {rows}=await client.query(`SELECT * FROM associate_links
      WHERE member_low=$1 AND member_high=$2 FOR UPDATE`,[lo,hi])
    const link=rows[0]
    if(!link)throw fail(404,'Associate connection not found.')
    const recipient=link.requester_id===link.member_low?link.member_high:link.member_low
    if(['associate_accept','associate_decline'].includes(action)){
      if(link.status!=='pending'||recipient!==userId)throw fail(403,'Only the recipient can answer this pending Associate request.')
      updated=action==='associate_accept'?'accepted':'declined'
      await client.query(`UPDATE associate_links SET status=$3,accepted_at=CASE WHEN $3='accepted' THEN NOW() ELSE NULL END, updated_at=NOW()
        WHERE member_low=$1 AND member_high=$2`,[lo,hi,updated])
    } else if(action==='associate_block'){
      updated='blocked'
      await client.query(`UPDATE associate_links SET status='blocked',
        vouched_by_low=FALSE,vouched_by_high=FALSE,updated_at=NOW()
        WHERE member_low=$1 AND member_high=$2`,[lo,hi])
    }else if(action==='associate_remove'){
      if(link.status!=='accepted')throw fail(409,'No active Associate connection to remove.')
      updated='removed'
      await client.query(`UPDATE associate_links SET status='removed',vouched_by_low=FALSE,vouched_by_high=FALSE,updated_at=NOW()
        WHERE member_low=$1 AND member_high=$2`,[lo,hi])
    } else {
      if(link.status!=='accepted')throw fail(403,'Only accepted Associates can vouch for one another.')
      const column=userId===lo?'vouched_by_low':'vouched_by_high'
      updated=action==='associate_vouch'
      await client.query(`UPDATE associate_links SET ${column}=$3, updated_at=NOW()
        WHERE member_low=$1 AND member_high=$2`,[lo,hi,updated])
    }
    await client.query('COMMIT')
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
  finally{client.release()}
  if(action==='associate_accept'||action==='associate_decline'){
    await notifyUser({userId:other,type:'associate_response',title:updated==='accepted'?'Associate request accepted':'Associate request declined',
      body:'Your professional connection request has been answered.',linkUrl:'/profile'})
  }
  return {ok:true,status:updated}
}

/**
 * Public-safe social proof derived only from accepted, voluntary vouches.
 * Missing migration is not a reason to break Showroom/Bento discovery.
 */
export async function associateVouchCounts(userIds=[]){
  const ids=[...new Set(userIds.filter(valid))]
  if(!ids.length)return {}
  const {rows:meta}=await query("SELECT to_regclass('associate_links') AS present")
  if(!meta[0]?.present)return {}
  const {rows}=await query(`SELECT subject_id,COUNT(*)::int AS vouches FROM (
    SELECT member_high AS subject_id FROM associate_links
      WHERE status='accepted' AND vouched_by_low=TRUE
    UNION ALL
    SELECT member_low AS subject_id FROM associate_links
      WHERE status='accepted' AND vouched_by_high=TRUE
  ) verified WHERE subject_id=ANY($1::uuid[]) GROUP BY subject_id`,[ids])
  return Object.fromEntries(rows.map(item=>[item.subject_id,Number(item.vouches)]))
}
