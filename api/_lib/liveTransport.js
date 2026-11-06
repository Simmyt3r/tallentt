import {resolveLiveMediaAvailability} from './liveMedia.js'
import {cloudinaryLiveAvailability} from './cloudinaryLive.js'
import {livekitAvailability} from './livekitCloud.js'

// Existing app/database video is always available; larger external transports
// remain optional for deployments which have already configured them.
export async function resolveBroadcastAvailability(){
  // Browser-first by default. Cloudinary RTMP is an explicit legacy/encoder option,
  // never a silent fallback when someone expects one-tap camera broadcasting.
  const preferred=String(process.env.LIVE_VIDEO_PROVIDER||'platform').trim().toLowerCase()
  const platform={mode:'platform',ready:true,reason:null}
  if(preferred==='platform'||preferred==='auto')return platform
  if(preferred==='livekit'){
    const info=await livekitAvailability()
    return info.ready?{mode:'livekit',ready:true,reason:null}:platform
  }
  if(preferred==='cloudinary'){
    const info=await cloudinaryLiveAvailability()
    return info.ready?{mode:'cloudinary',ready:true,reason:null}:platform
  }
  if(preferred!=='mediamtx')return platform
  const relay=await resolveLiveMediaAvailability()
  if(relay.mode==='mediamtx')return {mode:'mediamtx',ready:true,reason:null}
  return platform
}
