import {getLiveMediaMode,resolveLiveMediaAvailability} from './liveMedia.js'
import {cloudinaryLiveAvailability,cloudinaryLiveConfigured} from './cloudinaryLive.js'

// Browser-only broadcasting uses WebRTC/WHIP. Cloudinary RTMP remains an
// explicit opt-in for legacy encoder workflows (not a browser camera ingest).
export async function resolveBroadcastAvailability(){
  // Browser-first by default. Cloudinary RTMP is an explicit legacy/encoder option,
  // never a silent fallback when someone expects one-tap camera broadcasting.
  const preferred=String(process.env.LIVE_VIDEO_PROVIDER||'mediamtx').trim().toLowerCase()
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
