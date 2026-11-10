import {useEffect,useRef,useState} from 'react'
import {SHOWROOM_AD_POLICY} from '../../shared/showroomAdPolicy.js'

// An interruptible, nonbillable preview shown only in an active Showroom post.
// Sound never enables itself; seeking is disabled, and the underlying Talent
// video is paused by the parent for the entire time this sponsored clip shows.
export default function ShowroomVideoAd({ad,onDismiss,onStarted}){
  const videoRef=useRef(null)
  const started=useRef(false)
  const autoAttempted=useRef(false)
  const [seconds,setSeconds]=useState(0)
  const [muted,setMuted]=useState(true)
  const [paused,setPaused]=useState(false)
  const [failure,setFailure]=useState('')
  const end=Math.min(seconds,SHOWROOM_AD_POLICY.maximumPlaybackSeconds)
  const canSkip=seconds>=SHOWROOM_AD_POLICY.skipAfterSeconds||!!failure
  useEffect(()=>{
    const el=videoRef.current
    return()=>{el?.pause()}
  },[ad.id])
  useEffect(()=>{
    // If a browser blocks muted autoplay or the media never loads, never
    // leave the original Talent post covered indefinitely.
    if(failure)return undefined
    const timer=setTimeout(()=>{
      if(!started.current)setFailure('Preview playback is unavailable.')
    },10000)
    return()=>clearTimeout(timer)
  },[ad.id,failure])
  async function startMuted(){
    if(autoAttempted.current)return
    autoAttempted.current=true
    const el=videoRef.current
    if(!el)return
    try{await el.play()}catch{
      setFailure('Automatic playback unavailable. Play or continue to the post.')
    }
  }
  async function togglePlay(){
    const el=videoRef.current
    if(!el)return
    if(!el.paused){el.pause();setPaused(true);return}
    try{await el.play();setFailure('');setPaused(false)}
    catch{setFailure('Video cannot play on this device.')}
  }
  function updateTime(event){
    const n=Math.max(0,Number(event.currentTarget.currentTime)||0)
    setSeconds(n)
    if(n>=SHOWROOM_AD_POLICY.maximumPlaybackSeconds){
      event.currentTarget.pause()
      onDismiss()
    }
  }
  function toggleSound(){
    const next=!muted
    if(videoRef.current)videoRef.current.muted=next
    setMuted(next)
  }
  return <div role="region" aria-label={'Sponsored video from '+ad.sponsor_name}
    className="absolute inset-0 z-30 flex flex-col overflow-hidden bg-[#080A17] text-white">
    <div className="absolute left-3 right-3 top-3 z-10 flex items-center justify-between gap-2">
      <span className="rounded-full bg-[#0A13E6] px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-white">Sponsored video</span>
      <span className="rounded-full bg-black/75 px-3 py-1.5 text-[11px] font-semibold">
        {Math.max(0,Math.ceil(SHOWROOM_AD_POLICY.maximumPlaybackSeconds-end))}s max
      </span>
    </div>
    <video ref={videoRef} src={ad.video_url} muted playsInline autoPlay preload="metadata"
      aria-label={'Promotional video by '+ad.sponsor_name}
      className="min-h-0 h-full w-full flex-1 object-contain bg-black"
      onCanPlay={startMuted}
      onPlaying={()=>{setPaused(false);if(!started.current){started.current=true;onStarted?.(ad.id)}}}
      onPause={()=>setPaused(true)}
      onTimeUpdate={updateTime}
      onEnded={onDismiss}
      onError={()=>setFailure('This sponsored video could not be loaded.')}/>
    <div className="shrink-0 space-y-2 border-t border-white/15 bg-[#080A17] px-3 pb-3 pt-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold">{ad.sponsor_name}</p>
          {ad.caption&&<p className="line-clamp-1 break-words text-[11px] text-white/65">{ad.caption}</p>}
        </div>
        <button type="button" onClick={togglePlay}
          className="min-h-10 rounded-full border border-white/30 px-3 text-[11px] font-bold">
          {paused||failure?'Play':'Pause'}
        </button>
        <button type="button" onClick={toggleSound} aria-pressed={!muted}
          className="min-h-10 rounded-full border border-white/30 px-3 text-[11px] font-bold">
          {muted?'Unmute':'Mute'}
        </button>
        <button type="button" disabled={!canSkip} onClick={onDismiss}
          className="min-h-10 rounded-full bg-[#0A13E6] px-4 text-[11px] font-black text-white disabled:opacity-50">
          {canSkip?'Skip ad':'Skip in '+Math.max(1,Math.ceil(SHOWROOM_AD_POLICY.skipAfterSeconds-seconds))+'s'}
        </button>
      </div>
      {failure&&<div role="status" className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-200">
        {failure}
        <button type="button" onClick={onDismiss} className="min-h-9 rounded-full border border-amber-300/60 px-3 font-bold">
          Continue to Talent post
        </button>
      </div>}
    </div>
  </div>
}
