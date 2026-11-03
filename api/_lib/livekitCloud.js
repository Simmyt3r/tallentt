// Managed LiveKit Cloud transport. No VPS, RTMP encoder or exposed API secret.
// Uses the existing jsonwebtoken dependency and LiveKit's documented Twirp RoomService API.
import jwt from 'jsonwebtoken'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i
const fail=(status,message)=>Object.assign(new Error(message),{status})

function config(){
  const url=String(process.env.LIVEKIT_URL||'').trim()
  const key=String(process.env.LIVEKIT_API_KEY||'').trim()
  const secret=String(process.env.LIVEKIT_API_SECRET||'').trim()
  let parsed
  try{parsed=new URL(url)}catch{return null}
  // Only TLS WebSockets; the matching HTTPS origin is used for server calls.
  if(parsed.protocol!=='wss:'||!parsed.hostname||parsed.username||parsed.password||
      parsed.pathname!=='/'||parsed.search||parsed.hash||
      !/^[a-zA-Z0-9_-]{8,128}$/.test(key)||secret.length<16)return null
  return {url:parsed.origin,key,secret,apiUrl:'https://'+parsed.host}
}
export function livekitConfigured(){return Boolean(config())}
export function livekitRoomName(id){
  if(!UUID.test(String(id||'')))throw fail(400,'Invalid Live room identifier.')
  return 'lk-'+id
}
export function isLivekitStream(row){
  return /^lk-[0-9a-f-]{36}$/i.test(String(row?.stream_path||''))
}
function authToken(c,grants,identity='chombutar-service',ttl='1m'){
  return jwt.sign({video:grants},c.secret,{
    algorithm:'HS256',issuer:c.key,subject:identity,expiresIn:ttl,
  })
}
export function livekitJoinCredentials({room,userId,publisher=false}){
  const c=config()
  if(!c)throw fail(503,'LiveKit Cloud is not configured in Vercel.')
  if(!/^lk-[0-9a-f-]{36}$/i.test(String(room||''))||!UUID.test(String(userId||'')))
    throw fail(400,'Invalid LiveKit participant request.')
  return {url:c.url,token:authToken(c,{
    room,roomJoin:true,canSubscribe:true,
    canPublish:Boolean(publisher),canPublishData:false,
    ...(publisher?{canPublishSources:['camera','microphone']}:{}),
  },userId,'30m')}
}
async function service(method,body,grants){
  const c=config()
  if(!c)throw fail(503,'LiveKit Cloud is not configured in Vercel.')
  let res
  try{
    res=await fetch(c.apiUrl+'/twirp/livekit.RoomService/'+method,{
      method:'POST',cache:'no-store',signal:AbortSignal.timeout(7500),
      headers:{Authorization:'Bearer '+authToken(c,grants),'Content-Type':'application/json'},
      body:JSON.stringify(body),
    })
  }catch{throw fail(503,'LiveKit Cloud could not be reached. Check the project URL or connection.')}
  if(!res.ok){
    if(res.status===401||res.status===403)
      throw fail(503,'LiveKit credentials are invalid or lack RoomService access.')
    if(res.status===404)throw fail(404,'LiveKit room or participant is not available.')
    if(res.status===429)throw fail(503,'LiveKit Cloud usage limit reached.')
    throw fail(502,'LiveKit Cloud request failed (HTTP '+res.status+').')
  }
  return res.json().catch(()=>{throw fail(502,'LiveKit Cloud returned an invalid response.')})
}
export async function livekitAvailability(){
  if(!livekitConfigured())return {ready:false,reason:'livekit_unconfigured'}
  try{await service('ListRooms',{}, {roomList:true})
    return {ready:true,reason:null}
  }catch(error){return {ready:false,reason:'livekit_unavailable',message:error.message}}
}
export async function createLivekitRoom(room){
  return service('CreateRoom',{
    name:room,emptyTimeout:120,departureTimeout:60,maxParticipants:100,
  },{roomCreate:true})
}
export async function livekitHostPublishing(room,hostId){
  try{
    const p=await service('GetParticipant',{room,identity:hostId},{roomAdmin:true,room})
    // RoomService is authoritative. Any actually published track must come
    // from the host identity; viewer tokens cannot publish.
    return Array.isArray(p?.tracks)&&p.tracks.length>0
  }catch(error){if(error.status===404)return false;throw error}
}
export async function deleteLivekitRoom(room){
  try{return await service('DeleteRoom',{room},{roomCreate:true})}
  catch(error){if(error.status!==404)throw error}
}
