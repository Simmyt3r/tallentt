// Read-only public discovery. No session-dependent joins or writes are allowed.
// Guest activity never creates Orbit, Discovery, views, Likes or KeepUp events.
import {query} from './db.js'
import {accountOrbit} from './accountOrbit.js'
import {SHOWROOM_SQL_CONTACT_PATTERN} from './showroomEligibility.js'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const USERNAME=/^[a-z0-9._-]{3,30}$/i
const fail=(status,message)=>Object.assign(new Error(message),{status})
const text=(value,max)=>String(value||'').trim().slice(0,max)
const NUMBER_OF_CARDS=12
const displayScore=async id=>{
  try {
    const result=await accountOrbit(id)
    const score=Number(result?.score)
    return Number.isFinite(score)?Math.round(score*10)/10:null
  } catch { return null }
}

async function socialCounts(ids){
  const map=new Map(ids.map(id=>[id,{discovery_count:null,keepup_count:null}]))
  if(!ids.length)return map
  const {rows:present}=await query("SELECT to_regclass('subscriber_follows') AS follows,to_regclass('orbit_verified_events') AS verified")
  if(present[0]?.follows){
    const {rows}=await query('SELECT followed_id AS id, COUNT(*)::int AS count FROM subscriber_follows WHERE followed_id=ANY($1::uuid[]) GROUP BY followed_id',[ids])
    for(const r of rows)map.get(r.id).keepup_count=Number(r.count)
    for(const id of ids)if(map.get(id).keepup_count===null)map.get(id).keepup_count=0
  }
  if(present[0]?.verified){
    const {rows}=await query("SELECT subject_id AS id,COUNT(DISTINCT actor_id)::int AS count FROM orbit_verified_events WHERE subject_id=ANY($1::uuid[]) AND verb='Discover' AND status='awarded' GROUP BY subject_id",[ids])
    for(const r of rows)map.get(r.id).discovery_count=Number(r.count)
    for(const id of ids)if(map.get(id).discovery_count===null)map.get(id).discovery_count=0
  }
  return map
}

async function decorate(hats){
  const ids=[...new Set(hats.map(h=>h.user_id))]
  const [social,scores]=await Promise.all([
    socialCounts(ids),
    Promise.all(ids.map(displayScore)),
  ])
  const orbit=new Map(ids.map((id,i)=>[id,scores[i]]))
  const idsForMedia=hats.map(h=>h.id)
  const media=new Map(idsForMedia.map(id=>[id,[]]))
  if(idsForMedia.length){
    const {rows}=await query(`SELECT hat_id,url,type,caption FROM hat_media
      WHERE hat_id=ANY($1::uuid[]) AND screening_status IN ('legacy','passed')
        AND type IN ('image','video','audio')
      ORDER BY created_at,id`,[idsForMedia])
    for(const item of rows)media.get(item.hat_id)?.push({url:item.url,type:item.type,caption:item.caption||''})
  }
  return hats.map(h=>({
    id:h.id,user_id:h.user_id,username:h.username,
    owner_full_name:h.owner_full_name,owner_avatar:h.owner_avatar,
    hat_title:h.hat_title,hat_name:h.hat_name,category:h.category,
    role:h.role,price_type:h.price_type,price_min:h.price_min,price_max:h.price_max,
    rate:h.rate,currency:h.currency||'NGN',lga:h.lga||h.owner_lga||null,
    availability:h.availability,motto:h.motto||'',created_at:h.created_at,
    media:media.get(h.id)||[],orbit_score:orbit.get(h.user_id),
    ...social.get(h.user_id),
  })).sort((a,b)=>{
    if(a.orbit_score===null&&b.orbit_score!==null)return 1
    if(b.orbit_score===null&&a.orbit_score!==null)return -1
    return (b.orbit_score??0)-(a.orbit_score??0) || new Date(b.created_at)-new Date(a.created_at)
  })
}

async function guestHats({view,search,city,username,id,page}){
  const {rows:tables}=await query("SELECT to_regclass('showroom_hidden_hats') AS hidden,to_regclass('showroom_review_state') AS review")
  const hidden=tables[0]?.hidden?"AND NOT EXISTS (SELECT 1 FROM showroom_hidden_hats sh WHERE sh.hat_id=h.id)":''
  const review=tables[0]?.review?"AND NOT EXISTS (SELECT 1 FROM showroom_review_state s WHERE s.hat_id=h.id AND s.status IN ('flagged','restricted'))":''
  // Never make a hidden Bento Hat appear merely because its owner has another public Hat.
  const approved="EXISTS (SELECT 1 FROM hat_media m WHERE m.hat_id=h.id AND m.screening_status IN ('legacy','passed'))"
  const held="NOT EXISTS (SELECT 1 FROM hat_media m WHERE m.hat_id=h.id AND m.screening_status IN ('pending','processing','held','rejected'))"
  const filter=view==='bento'?"h.feed_visible=TRUE":approved
  const params=[search||null,city||null,username||null,id||null,SHOWROOM_SQL_CONTACT_PATTERN,NUMBER_OF_CARDS+1,Math.min(page,30)*NUMBER_OF_CARDS]
  const {rows}=await query(`SELECT h.id,h.user_id,h.username,h.hat_title,h.hat_name,h.category,h.role,
       h.price_type,h.price_min,h.price_max,h.rate,h.currency,h.lga,h.availability,h.motto,h.created_at,
       u.full_name AS owner_full_name,u.avatar_url AS owner_avatar,u.lga AS owner_lga
    FROM hats h JOIN users u ON u.id=h.user_id
    WHERE h.active=TRUE AND h.role='talent'
      AND ${filter} AND ${held} ${hidden} ${review}
      AND NOT (COALESCE(h.hat_title,'')||' '||COALESCE(h.hat_name,'')||' '||COALESCE(h.motto,'') ~* $5)
      AND ($1::text IS NULL OR h.hat_title ILIKE '%'||$1||'%' OR h.hat_name ILIKE '%'||$1||'%'
          OR h.username ILIKE '%'||$1||'%' OR h.category ILIKE '%'||$1||'%')
      AND ($2::text IS NULL OR LOWER(COALESCE(NULLIF(h.lga,''),u.lga,''))=LOWER($2))
      AND ($3::text IS NULL OR LOWER(h.username)=LOWER($3))
      AND ($4::uuid IS NULL OR h.id=$4)
    ORDER BY h.created_at DESC,h.id DESC LIMIT $6 OFFSET $7`,params)
  const hats=await decorate(rows.slice(0,NUMBER_OF_CARDS))
  return {hats,nextPage:rows.length>NUMBER_OF_CARDS?page+1:null,mode:view}
}

async function guestVibes({search,page}){
  const {rows:present}=await query("SELECT to_regclass('vibes_posts') AS present")
  if(!present[0]?.present)return {posts:[],nextPage:null,mode:'vibes'}
  const {rows}=await query(`SELECT p.id,p.author_id AS user_id,p.body,p.media,p.created_at,
     u.username,u.full_name AS owner_full_name,u.avatar_url AS owner_avatar,
     (SELECT COUNT(*)::int FROM vibes_likes l WHERE l.post_id=p.id) AS likes,
     (SELECT COUNT(*)::int FROM vibes_comments c WHERE c.post_id=p.id AND c.deleted_at IS NULL) AS comments
   FROM vibes_posts p JOIN users u ON u.id=p.author_id
   WHERE p.deleted_at IS NULL AND p.moderation_status='visible' AND u.role IN ('talent','dual')
     AND ($1::text IS NULL OR p.body ILIKE '%'||$1||'%' OR u.username ILIKE '%'||$1||'%')
   ORDER BY p.created_at DESC,p.id DESC LIMIT $2 OFFSET $3`,
   [search||null,NUMBER_OF_CARDS+1,Math.min(page,30)*NUMBER_OF_CARDS])
  const posts=rows.slice(0,NUMBER_OF_CARDS).map(row=>({
    id:row.id,user_id:row.user_id,username:row.username,
    owner_full_name:row.owner_full_name,owner_avatar:row.owner_avatar,
    body:row.body,media:(Array.isArray(row.media)?row.media:[]).filter(item=>
      item?.url&&['image','video'].includes(item.type)).map(item=>({url:item.url,type:item.type})),
    created_at:row.created_at,likes:Number(row.likes),comments:Number(row.comments),
  }))
  return {posts,nextPage:rows.length>NUMBER_OF_CARDS?page+1:null,mode:'vibes'}
}

export async function guestDiscovery(params={}){
  const view=text(params.mode||'showroom',15)
  if(!['showroom','bento','vibes'].includes(view))throw fail(400,'Choose a public discovery view.')
  const search=text(params.search,80),city=text(params.city,60)
  const username=text(params.username,30),id=text(params.id,40)
  const page=Number(params.page||0)
  if(!Number.isInteger(page)||page<0||page>30)throw fail(400,'Invalid discovery page.')
  if(username&&!USERNAME.test(username))throw fail(400,'Invalid Talent username.')
  if(id&&!UUID.test(id))throw fail(400,'Invalid Hat.')
  if((username||id)&&view==='vibes')throw fail(400,'Invalid Vibes filter.')
  return view==='vibes'?guestVibes({search,page}):guestHats({view,search,city,username,id,page})
}
