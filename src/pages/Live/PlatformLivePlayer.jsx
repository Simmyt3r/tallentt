import {useEffect,useRef,useState} from 'react'

// Independent clips are preloaded into a second video element so native video
// playback works without MSE, WebRTC relays or a third-party playback library.
export default function PlatformLivePlayer({id,mediaStream,onState}){
  const videos=[useRef(null),useRef(null)],control=useRef(null)
  const [active,setActive]=useState(0),[muted,setMuted]=useState(true),[blocked,setBlocked]=useState(false)
  const mutedRef=useRef(true)
  useEffect(()=>{
    mutedRef.current=muted
    videos.forEach(ref=>{if(ref.current)ref.current.muted=muted})
  },[muted])

  useEffect(()=>{
    const first=videos[0].current
    if(mediaStream){
      first.srcObject=mediaStream;first.muted=true
      first.play().catch(()=>{})
      onState?.('playing')
      return()=>{first.srcObject=null}
    }
    let closed=false,timer,busy=false,cursor=0,slot=0,playing=false
    const ready=[],urls=new Set(),abort=new AbortController()
    const refs=videos.map(ref=>ref.current)
    function release(url){if(url){URL.revokeObjectURL(url);urls.delete(url)}}
    function preload(){
      const next=ready[0],video=refs[1-slot]
      if(!next||video.dataset.sequence===String(next.sequence))return
      video.src=next.url;video.dataset.sequence=String(next.sequence);video.load()
    }
    function advance(){
      if(closed||!ready.length){playing=false;onState?.('loading');return}
      const clip=ready.shift(),old=refs[slot],next=playing?1-slot:slot
      // The previous active clip can have ended while the next one was loading.
      const target=refs[next]
      const oldUrl=old.dataset.objectUrl
      if(target.src!==clip.url){target.src=clip.url;target.load()}
      slot=next;target.dataset.sequence=String(clip.sequence);target.dataset.objectUrl=clip.url
      target.muted=mutedRef.current;playing=true;setActive(slot)
      target.play().then(()=>{if(!closed){setBlocked(false);onState?.('playing')}})
        .catch(()=>{if(!closed){setBlocked(true);onState?.('loading')}})
      if(old!==target){old.pause();old.removeAttribute('src');delete old.dataset.sequence;delete old.dataset.objectUrl}
      if(oldUrl!==clip.url)release(oldUrl)
      preload()
    }
    refs.forEach(video=>{video.onended=advance;video.onerror=()=>onState?.('error')})
    control.current={play:()=>refs[slot].play().then(()=>{setBlocked(false);onState?.('playing')})}
    async function poll(){
      if(closed||busy)return
      busy=true
      try{
        const response=await fetch(`/api/live?media_manifest=${encodeURIComponent(id)}`,{signal:abort.signal,cache:'no-store'})
        if(!response.ok)throw new Error('Live video unavailable')
        const manifest=await response.json()
        if(['ended','failed'].includes(manifest.status)){onState?.('ended');return}
        let segments=manifest.segments.filter(item=>item.sequence>cursor)
        if(cursor===0||segments.length>4){
          segments=segments.slice(-2)
          ready.splice(0).forEach(clip=>release(clip.url))
        }
        for(const segment of segments){
          if(closed||ready.length>=3)break
          const video=await fetch(`/api/live?media_segment=${encodeURIComponent(id)}&sequence=${segment.sequence}`,
            {signal:abort.signal,cache:'no-store'})
          if(video.status===404){cursor=segment.sequence;continue}
          if(!video.ok)throw new Error('Live video download failed')
          const blob=await video.blob()
          if(closed)return
          const url=URL.createObjectURL(blob);urls.add(url)
          ready.push({url,sequence:segment.sequence});cursor=segment.sequence
        }
        if(!playing&&ready.length)advance()
        else preload()
        if(manifest.status==='reconnecting')onState?.('reconnecting')
      }catch(error){if(!closed&&error.name!=='AbortError')onState?.('reconnecting')}
      finally{busy=false;if(!closed)timer=setTimeout(poll,1000)}
    }
    onState?.('loading');poll()
    return()=>{
      closed=true;clearTimeout(timer);abort.abort();control.current=null
      refs.forEach(video=>{video.onended=null;video.onerror=null;video.pause();video.removeAttribute('src');video.load()})
      urls.forEach(release)
    }
  },[id,mediaStream,onState])

  return <div role="region" className="relative h-full w-full bg-black" aria-label="Live video player">
    {videos.map((ref,index)=><video key={index} ref={ref} muted={mediaStream?true:muted} playsInline
      aria-label={index===active?'Live video':'Preloading Live video'}
      className={`absolute inset-0 h-full w-full object-contain ${index===active?'visible':'invisible'}`}/>)}
    {!mediaStream&&<button type="button" onClick={()=>setMuted(value=>!value)}
      className="absolute left-3 top-3 min-h-10 rounded-full bg-black/70 px-3 text-xs font-bold text-white">
      {muted?'Enable sound':'Mute sound'}
    </button>}
    {blocked&&<button type="button" onClick={()=>control.current?.play().catch(()=>{})}
      className="absolute inset-0 m-auto h-12 w-36 rounded-full bg-[#0A13E6] font-bold text-white">Play Live</button>}
  </div>
}
