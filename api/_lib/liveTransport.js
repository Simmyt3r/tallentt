import {getLiveMediaMode,resolveLiveMediaAvailability} from './liveMedia.js'
import {cloudinaryLiveAvailability,cloudinaryLiveConfigured} from './cloudinaryLive.js'

// Auto prefers browser broadcasting when WHIP is truly reachable, otherwise
// falls back to a REAL Cloudinary RTMP broadcast, not a misleading camera preview.
export async function resolveBroadcastAvailability(){
  const preferred=String(process.env.LIVE_VIDEO_PROVIDER||'auto').trim().toLowerCase()
  if(preferred==='cloudinary'){
    const info=await cloudinaryLiveAvailability()
    return {mode:info.ready?'cloudinary':'fallback',ready:info.ready,reason:info.reason,message:info.message}
  }
  if(preferred!=='mediamtx' && preferred!=='auto')return {mode:'fallback',ready:false,reason:'invalid_provider'}
  const relay=await resolveLiveMediaAvailability()
  if(relay.mode==='mediamtx')return {mode:'mediamtx',ready:true,reason:null}
  if(preferred==='mediamtx')return{mode:'fallback',ready:false,reason:relay.reason}
  if(cloudinaryLiveConfigured()){
    const info=await cloudinaryLiveAvailability()
    return {mode:info.ready?'cloudinary':'fallback',ready:info.ready,
      reason:info.reason,message:info.message}
  }
  return {mode:'fallback',ready:false,reason:relay.reason}
}
