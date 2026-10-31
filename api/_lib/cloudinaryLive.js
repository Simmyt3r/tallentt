// Cloudinary Live Streaming: RTMP publishing, CDN HLS playback.
// This is NOT the normal Cloudinary upload API. API secrets must remain on the server.
const cloudNamePattern=/^[a-z0-9_-]{2,100}$/i
const streamIdPattern=/^[a-z0-9_-]{10,128}$/i
const safe=(status,message)=>Object.assign(new Error(message),{status})
function config(){
  let raw={}
  try{
    const url=new URL(String(process.env.CLOUDINARY_URL||''))
    if(url.protocol==='cloudinary:')raw={cloud:url.hostname,key:decodeURIComponent(url.username),secret:decodeURIComponent(url.password)}
  }catch{}
  const cloud=process.env.CLOUDINARY_CLOUD_NAME||raw.cloud
  const key=process.env.CLOUDINARY_API_KEY||raw.key
  const secret=process.env.CLOUDINARY_API_SECRET||raw.secret
  if(!cloud||!key||!secret||!cloudNamePattern.test(cloud))return null
  return {cloud,key,secret}
}
export function cloudinaryLiveConfigured(){return Boolean(config())}
export function cloudinaryLiveMode(){
  const preferred=String(process.env.LIVE_VIDEO_PROVIDER||'auto').toLowerCase()
  return preferred==='cloudinary'||preferred==='auto'
}
async function call(method,path,{body}={}){
  const c=config()
  if(!c)throw safe(503,'Cloudinary Live is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET on the server.')
  const controller=new AbortController()
  const timeout=setTimeout(()=>controller.abort(),8000)
  try{
    const res=await fetch(`https://api.cloudinary.com/v2/video/${encodeURIComponent(c.cloud)}/${path}`,{
      method,signal:controller.signal,cache:'no-store',
      headers:{Authorization:`Basic ${Buffer.from(c.key+':'+c.secret).toString('base64')}`,
        ...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
    })
    if(!res.ok){
      if([401,403].includes(res.status))throw safe(503,'Cloudinary Live Streaming is not enabled or these credentials lack permission. Enable Live Streaming in the Cloudinary Console.')
      if(res.status===404)throw safe(404,'Cloudinary Live stream no longer exists.')
      if(res.status===429)throw safe(503,'Cloudinary Live rate limit reached. Try again later.')
      throw safe(502,`Cloudinary Live returned HTTP ${res.status}.`)
    }
    const data=await res.json()
    if(!data?.data)throw safe(502,'Cloudinary Live returned an unexpected response.')
    return data.data
  }catch(err){
    if(err.status)throw err
    throw safe(503,err.name==='AbortError'?'Cloudinary Live did not respond. Check connectivity.':'Unable to reach the Cloudinary Live API.')
  }finally{clearTimeout(timeout)}
}
export async function cloudinaryLiveAvailability(){
  if(!cloudinaryLiveMode()||!cloudinaryLiveConfigured())return {ready:false,reason:'cloudinary_unconfigured'}
  try{
    await call('GET','live_streams')
    return {ready:true,reason:null}
  }catch(err){return{ready:false,reason:'cloudinary_unavailable',message:err.message}}
}
function validateCloudinaryLiveResult(raw){
  const c=config()
  const id=String(raw?.id||'')
  const uri=String(raw?.input?.uri||'')
  const key=String(raw?.input?.stream_key||'')
  const hls=raw?.outputs?.find(output=>output?.type==='hls')?.uri
  if(!streamIdPattern.test(id)||!/^rtmps?:\/\//i.test(uri)||!key||
     !isAllowedCloudinaryHls(hls,c?.cloud))
    throw safe(502,'Cloudinary returned incomplete Live input or HLS output information.')
  return {id,rtmpUrl:uri,streamKey:key,hlsUrl:hls,status:raw.status||'idle'}
}
export function isAllowedCloudinaryHls(value,cloud){
  try{
    const u=new URL(value)
    return u.protocol==='https:'&&u.hostname==='res.cloudinary.com'&&
      u.pathname.startsWith(`/${cloud}/video/live/`)&&u.pathname.endsWith('.m3u8')&&
      !u.username&&!u.password
  }catch{return false}
}
export async function createCloudinaryLive(title){
  const raw=await call('POST','live_streams',{body:{
    name:String(title||'ChombuTar Live').slice(0,120),
    input:{type:'rtmp'},idle_timeout_sec:120,max_runtime_sec:10800,
  }})
  return validateCloudinaryLiveResult(raw)
}
export async function getCloudinaryLive(id){
  if(!streamIdPattern.test(String(id||'')))throw safe(400,'Invalid Cloudinary stream reference.')
  return validateCloudinaryLiveResult(await call('GET',`live_streams/${encodeURIComponent(id)}`))
}
export async function idleCloudinaryLive(id){
  if(!streamIdPattern.test(String(id||'')))throw safe(400,'Invalid Cloudinary stream reference.')
  await call('POST',`live_streams/${encodeURIComponent(id)}/idle`)
}
export async function deleteCloudinaryLive(id){
  if(!streamIdPattern.test(String(id||'')))return
  try{await call('DELETE',`live_streams/${encodeURIComponent(id)}`)}
  catch(err){if(err.status!==404)throw err}
}
