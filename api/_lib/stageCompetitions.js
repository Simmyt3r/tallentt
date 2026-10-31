// Live Stage competition rounds. Deliberately no wallet debits, stakes,
// payouts, or gambling. Video is supplied by each contestant's existing Live.
import {query,getClient} from './db.js'
import {publicLiveMediaEndpoints} from './liveMedia.js'

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const bad=(status,message)=>Object.assign(new Error(message),{status})
const requiredId=id=>{if(!UUID.test(String(id||'')))throw bad(400,'Invalid competition.');return id}
async function checkInstall() {
  const {rows}=await query("SELECT to_regclass('stage_competitions') AS name")
  if(!rows[0]?.name)throw bad(503,'Apply the Live Stage competitions migration in Admin first.')
}
function clean(value,max,label) {
  if(typeof value!=='string' || !value.trim() || value.trim().length>max)
    throw bad(400,label+' must be between 1 and '+max+' characters.')
  return value.trim()
}

export async function listStageCompetitions() {
  await checkInstall()
  const {rows}=await query(`SELECT c.id,c.host_id,c.title,c.category,c.description,
    c.max_contestants,c.status,c.created_at,c.started_at,c.ended_at,
    u.username AS host_username,u.full_name AS host_full_name,
    (SELECT COUNT(*)::int FROM stage_competition_entrants e WHERE e.competition_id=c.id) AS participants,
    (SELECT COUNT(*)::int FROM stage_competition_votes v WHERE v.competition_id=c.id) AS votes
    FROM stage_competitions c JOIN users u ON u.id=c.host_id
    WHERE c.status IN ('registration','live','completed')
    ORDER BY CASE c.status WHEN 'live' THEN 0 WHEN 'registration' THEN 1 ELSE 2 END,
    c.created_at DESC LIMIT 60`)
  return {competitions:rows}
}

export async function ownCompetitionStreams(userId) {
  await checkInstall()
  const {rows}=await query(`SELECT id,title,category,started_at FROM live_streams
    WHERE talent_id=$1 AND status='live' AND media_status='connected'
    ORDER BY started_at DESC LIMIT 6`,[userId])
  return {streams:rows}
}

export async function stageCompetition(userId,id) {
  await checkInstall()
  requiredId(id)
  const {rows}=await query(`SELECT c.*,u.username AS host_username,
    u.full_name AS host_full_name FROM stage_competitions c
    JOIN users u ON u.id=c.host_id WHERE c.id=$1`,[id])
  if(!rows.length)throw bad(404,'Competition not found.')
  const contest=rows[0]
  const {rows:participants}=await query(`SELECT e.talent_id,e.stream_id,e.joined_at,
    u.username,u.full_name,u.avatar_url,u.role,u.company_suffix,
    s.title AS live_title,s.status AS stream_status,
    s.media_status,s.stream_path,
    to_jsonb(s)->>'cloudinary_stream_id' AS cloudinary_stream_id,
    to_jsonb(s)->>'cloudinary_hls_url' AS cloudinary_hls_url,
    (SELECT COUNT(*)::int FROM stage_competition_votes v
      WHERE v.competition_id=e.competition_id AND v.talent_id=e.talent_id) AS votes
    FROM stage_competition_entrants e
    JOIN users u ON u.id=e.talent_id JOIN live_streams s ON s.id=e.stream_id
    WHERE e.competition_id=$1
    ORDER BY votes DESC,e.joined_at ASC`,[id])
  const entrants=participants.map(({stream_path,cloudinary_stream_id,cloudinary_hls_url,...row})=>({
    ...row,hls_url:row.stream_status==='live'&&row.media_status==='connected'
      ? (cloudinary_stream_id ? cloudinary_hls_url : publicLiveMediaEndpoints(stream_path).hlsUrl)||null : null,
  }))
  const {rows:voted}=userId?await query(`SELECT talent_id FROM stage_competition_votes
    WHERE competition_id=$1 AND voter_id=$2`,[id,userId]):{rows:[]}
  return {competition:contest,entrants,voted_for:voted[0]?.talent_id||null,
    is_host:contest.host_id===userId,
    is_entrant:entrants.some(entry=>entry.talent_id===userId)}
}

export async function createStageCompetition(userId,body) {
  await checkInstall()
  const title=clean(body.title,120,'Title')
  if(title.length<5)throw bad(400,'The title must contain at least five characters.')
  const category=clean(body.category,80,'Category')
  const description=typeof body.description==='string' ? body.description.trim() : ''
  if(description.length>500)throw bad(400,'Description must be at most 500 characters.')
  const max=Number(body.max_contestants||4)
  if(!Number.isInteger(max)||max<2||max>6)throw bad(400,'Choose 2–6 contestants.')
  const {rows:auth}=await query("SELECT role FROM users WHERE id=$1",[userId])
  if(!['talent','dual'].includes(auth[0]?.role))
    throw bad(403,'Only Talent accounts may host a Stage competition.')
  const {rows:limit}=await query(`SELECT COUNT(*)::int AS n FROM stage_competitions
    WHERE host_id=$1 AND created_at>NOW()-INTERVAL '1 day'`,[userId])
  if(limit[0].n>=3)throw bad(429,'You can host up to three Stage competitions per day.')
  const {rows}=await query(`INSERT INTO stage_competitions(host_id,title,category,description,max_contestants)
    VALUES($1,$2,$3,$4,$5) RETURNING id`,[userId,title,category,description,max])
  return {id:rows[0].id}
}

export async function stageCompetitionAction(userId,body) {
  await checkInstall()
  const id=requiredId(body.competition_id)
  const client=await getClient()
  try {
    await client.query('BEGIN')
    const {rows:competitions}=await client.query('SELECT * FROM stage_competitions WHERE id=$1 FOR UPDATE',[id])
    if(!competitions.length)throw bad(404,'Competition not found.')
    const comp=competitions[0]
    const action=body.action
    if(action==='stage_join') {
      if(comp.status!=='registration')throw bad(409,'Registration has closed.')
      if(comp.host_id===userId)throw bad(403,'The event host cannot enter their own competition.')
      // Lock the subscriber across competitions to prevent simultaneous joins
      // racing past the cross-competition exclusivity check.
      const {rows:role}=await client.query("SELECT role FROM users WHERE id=$1 FOR UPDATE",[userId])
      if(!['talent','dual'].includes(role[0]?.role))throw bad(403,'Only Talent accounts may compete.')
      const streamId=requiredId(body.stream_id)
      const {rows:streams}=await client.query(`SELECT id FROM live_streams
        WHERE id=$1 AND talent_id=$2 AND status='live' AND media_status='connected'
        FOR SHARE`,[streamId,userId])
      if(!streams.length)throw bad(409,'Start a public Live stream before entering a Stage competition.')
      const {rows:count}=await client.query(`SELECT COUNT(*)::int AS n
        FROM stage_competition_entrants WHERE competition_id=$1`,[id])
      if(count[0].n>=comp.max_contestants)throw bad(409,'This competition is full.')
      const {rows:other}=await client.query(`SELECT 1 FROM stage_competition_entrants e
        JOIN stage_competitions c ON c.id=e.competition_id
        WHERE e.talent_id=$1 AND c.status IN ('registration','live')
          AND e.competition_id<>$2 LIMIT 1`,[userId,id])
      if(other.length)throw bad(409,'You are already entered in another open competition.')
      const {rowCount}=await client.query(`INSERT INTO stage_competition_entrants
        (competition_id,talent_id,stream_id) VALUES($1,$2,$3)
        ON CONFLICT DO NOTHING`,[id,userId,streamId])
      if(!rowCount)throw bad(409,'Already registered for this Stage competition.')
    } else if(action==='stage_vote') {
      if(comp.status!=='live')throw bad(409,'Voting is open only while the competition is live.')
      const talentId=requiredId(body.talent_id)
      if(comp.host_id===userId)throw bad(403,'Hosts cannot vote in competitions they administer.')
      const {rows:own}=await client.query('SELECT 1 FROM stage_competition_entrants WHERE competition_id=$1 AND talent_id=$2',
        [id,userId])
      if(own.length)throw bad(403,'Contestants cannot vote in their own competition.')
      const {rows:entrants}=await client.query(`SELECT 1 FROM stage_competition_entrants e
        JOIN live_streams s ON s.id=e.stream_id
        WHERE e.competition_id=$1 AND e.talent_id=$2
          AND s.status='live' AND s.media_status='connected'`,[id,talentId])
      if(!entrants.length)throw bad(409,'This contestant is not streaming right now.')
      const {rowCount}=await client.query(`INSERT INTO stage_competition_votes(competition_id,voter_id,talent_id)
        VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[id,userId,talentId])
      if(!rowCount)throw bad(409,'You have already voted in this competition.')
    } else if(['stage_start','stage_complete','stage_cancel'].includes(action)) {
      if(comp.host_id!==userId)throw bad(403,'Only the host can manage this competition.')
      if(action==='stage_start') {
        if(comp.status!=='registration')throw bad(409,'This competition has already started or ended.')
        const {rows:active}=await client.query(`SELECT COUNT(*)::int AS n
          FROM stage_competition_entrants e JOIN live_streams s ON s.id=e.stream_id
          WHERE e.competition_id=$1 AND s.status='live' AND s.media_status='connected'`,[id])
        if(active[0].n<2)throw bad(409,'At least two contestants must be streaming before the competition can start.')
        await client.query("UPDATE stage_competitions SET status='live',started_at=NOW() WHERE id=$1",[id])
      } else {
        if(action==='stage_complete' && comp.status!=='live')
          throw bad(409,'Only a live competition can be completed.')
        if(action==='stage_cancel' && !['live','registration'].includes(comp.status))
          throw bad(409,'This competition is already closed.')
        await client.query('UPDATE stage_competitions SET status=$2,ended_at=NOW() WHERE id=$1',
          [id,action==='stage_complete'?'completed':'cancelled'])
      }
    } else throw bad(400,'Unknown Stage action.')
    await client.query('COMMIT')
    return {ok:true}
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>{})
    throw error
  } finally {client.release()}
}
