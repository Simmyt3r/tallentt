// Explicit offline video saves only. No automatic streaming downloads.
// Cached complete Cloudinary responses are later served as byte ranges by
// the PWA service worker on browsers with working RangeRequests support.
const CACHE='chombutar-offline-videos-v1'
const MAX_BYTES=24*1024*1024
export function offlineVideoUrl(url,cloudName=import.meta.env?.VITE_CLOUDINARY_CLOUD_NAME){
  const target=new URL(url)
  const expectedCloud=String(cloudName||'').trim()
  const validPath=expectedCloud && target.pathname.startsWith('/'+expectedCloud+'/video/upload/')
  if(target.protocol!=='https:'||target.hostname!=='res.cloudinary.com'
     || !validPath || !/\.(mp4|webm|mov)$/i.test(target.pathname))
    throw new Error('Only ChombuTar video uploads can be saved offline.')
  target.searchParams.set('offline','1')
  return target.toString()
}
export async function isVideoSaved(url){
  if(!('caches' in window))return false
  const cache=await caches.open(CACHE)
  return Boolean(await cache.match(offlineVideoUrl(url)))
}
export async function saveVideo(url){
  if(!('caches' in window))throw new Error('Offline video storage is not supported by this browser.')
  if(!navigator.onLine)throw new Error('Connect to the internet to save this video.')
  const offline=offlineVideoUrl(url)
  const cache=await caches.open(CACHE)
  const existing=await cache.match(offline)
  if(existing)return offline
  const estimate=await navigator.storage?.estimate?.()
  if(estimate?.quota && estimate?.usage && estimate.quota-estimate.usage<MAX_BYTES)
    throw new Error('Your device does not have enough available storage.')
  const response=await fetch(offline,{mode:'cors',credentials:'omit'})
  if(!response.ok || response.status!==200 || response.type==='opaque')
    throw new Error('A complete video download is not available.')
  const type=String(response.headers.get('content-type')||'')
  if(!/^video\/(mp4|webm|quicktime)(?:;|$)/i.test(type))
    throw new Error('Video download returned unsupported content.')
  const size=Number(response.headers.get('content-length'))
  if(size && size>MAX_BYTES)throw new Error('This video is too large to save offline.')
  const blob=await response.blob()
  if(blob.size>MAX_BYTES)throw new Error('Video exceeds the 24MB offline limit.')
  const keys=await cache.keys()
  while(keys.length>=5)await cache.delete(keys.shift())
  await cache.put(offline,new Response(blob,{headers:{
    'Content-Type':response.headers.get('content-type')||'video/mp4',
    'Content-Length':String(blob.size),
  },status:200}))
  return offline
}
export async function clearSavedVideos(){
  if('caches' in window)await caches.delete(CACHE)
}
