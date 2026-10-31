import {useEffect,useRef,useState} from 'react'
import {ChevronLeft,ChevronRight,X} from 'lucide-react'
import {cldImage,cldVideoPoster} from '../lib/cloudinary.js'
import {isVideoSaved,offlineVideoUrl,saveVideo} from '../lib/offlineVideo.js'

// Opening any attachment gives a single gallery for the entire post. Videos
// only load their first bytes when opened, preserving mobile data.
export default function VibesMediaGallery({media=[],owner='subscriber',onShareVideo,sharing=false}){
  const [active,setActive]=useState(null)
  const [offlineSaved,setOfflineSaved]=useState(false)
  const [saving,setSaving]=useState(false)
  const [saveError,setSaveError]=useState('')
  const closeRef=useRef(null)
  const previousFocus=useRef(null)
  const startTouch=useRef(null)
  const current=active==null?null:media[active]
  useEffect(()=>{
    let valid=true
    setOfflineSaved(false)
    setSaveError('')
    if(current?.type==='video')isVideoSaved(current.url).then(result=>{
      if(valid)setOfflineSaved(result)
    }).catch(()=>{})
    return()=>{valid=false}
  },[current?.url])
  async function downloadOffline(){
    if(saving||!current)return
    setSaving(true);setSaveError('')
    try{await saveVideo(current.url);setOfflineSaved(true)}
    catch(error){setSaveError(error.message||'Could not save this video.')}
    finally{setSaving(false)}
  }

  useEffect(()=>{
    if(active===null)return undefined
    const key=e=>{
      if(e.key==='Escape')setActive(null)
      if(e.key==='ArrowLeft')setActive(i=>(i+media.length-1)%media.length)
      if(e.key==='ArrowRight')setActive(i=>(i+1)%media.length)
    }
    window.addEventListener('keydown',key)
    document.body.style.overflow='hidden'
    closeRef.current?.focus()
    return()=>{window.removeEventListener('keydown',key);document.body.style.overflow='';previousFocus.current?.focus?.()}
  },[active!==null,media.length])
  if(!Array.isArray(media)||!media.length)return null
  const open=i=>{previousFocus.current=document.activeElement;setActive(i)}
  return <>
    <div className={`mt-3 grid gap-1 overflow-hidden rounded-xl ${media.length>1?'grid-cols-2':'grid-cols-1'}`}>
      {media.slice(0,4).map((item,i)=><button key={item.public_id||i}
        type="button" onClick={()=>open(i)}
        aria-label={`Preview all ${media.length} attachments, starting with item ${i+1}`}
        className="relative min-w-0 overflow-hidden bg-black/5 text-left">
        {item.type==='video'?<img loading="lazy" src={cldVideoPoster(item.url,{w:700,h:500})}
          alt={`Video ${i+1} by ${owner}`}
          className="h-[170px] w-full object-cover sm:h-[220px]"/>:
          <img loading="lazy" src={cldImage(item.url,{w:700,h:500})}
          alt={`Image ${i+1} by ${owner}`}
          className={`w-full object-cover ${media.length===1?'max-h-[450px]':'h-[170px] sm:h-[220px]'}`}/>}
        {item.type==='video'&&<span className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-xs text-white">Video</span>}
        {i===3&&media.length>4&&<span className="absolute inset-0 grid place-items-center bg-black/60 text-2xl font-bold text-white">+{media.length-4}</span>}
      </button>)}
    </div>
    {current&&<div role="presentation" onClick={()=>setActive(null)}
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 p-3 text-white sm:p-5">
      <div role="dialog" aria-modal="true" aria-label={`Media gallery for ${owner}`}
        onClick={e=>e.stopPropagation()} className="flex min-h-0 flex-1 flex-col gap-3">
        <header className="flex shrink-0 items-center justify-between gap-3">
          <p className="text-sm font-bold">{owner} · {active+1} of {media.length}</p>
          <button type="button" ref={closeRef} onClick={()=>setActive(null)}
            aria-label="Close gallery" className="grid h-11 w-11 place-items-center rounded-full bg-white/15"><X/></button>
        </header>
        <div className="relative flex min-h-0 flex-1 items-center justify-center"
          onTouchStart={e=>{startTouch.current=e.touches[0]?.clientX}}
          onTouchEnd={e=>{if(startTouch.current==null)return;const delta=e.changedTouches[0]?.clientX-startTouch.current;startTouch.current=null;if(Math.abs(delta)>60)setActive(i=>(i+(delta<0?1:media.length-1))%media.length)}}>
          {current.type==='video'?<video key={current.public_id||active} src={offlineSaved?offlineVideoUrl(current.url):current.url}
            controls playsInline preload="metadata" className="max-h-full max-w-full object-contain"/>:
            <img key={current.public_id||active} src={current.url} alt={`Attachment ${active+1}`} className="max-h-full max-w-full object-contain"/>}
          {media.length>1&&<><button type="button" aria-label="Previous media" onClick={()=>setActive(i=>(i+media.length-1)%media.length)}
            className="absolute left-0 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/70"><ChevronLeft/></button>
            <button type="button" aria-label="Next media" onClick={()=>setActive(i=>(i+1)%media.length)}
            className="absolute right-0 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/70"><ChevronRight/></button></>}
        </div>
        {current.type==='video'&&<div className="flex shrink-0 flex-wrap items-center justify-center gap-3 text-[12px]">
          {onShareVideo&&<button type="button" disabled={sharing} onClick={()=>onShareVideo(current)}
            className="min-h-10 rounded-full border border-amber-300 px-4 font-bold disabled:opacity-50">
            {sharing?'Branding video…':'Share video with signed Work Pass QR'}
          </button>}
          <button type="button" disabled={saving||offlineSaved} onClick={downloadOffline}
            className="min-h-10 rounded-full border border-white/40 px-4 font-bold disabled:opacity-60">
            {offlineSaved?'Saved for offline playback':saving?'Saving video…':'Save video offline'}
          </button>
          <span className="text-white/60">Up to 5 saved videos · 24MB each</span>
          {saveError&&<span role="alert" className="text-amber-300">{saveError}</span>}
        </div>}
        <div className="flex shrink-0 gap-2 overflow-x-auto pb-2" aria-label="All attachments">
          {media.map((item,i)=><button type="button" key={item.public_id||i}
            aria-label={`Open media ${i+1}`} aria-current={active===i}
            onClick={()=>setActive(i)} className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${active===i?'border-white':'border-transparent'}`}>
            <img alt="" className="h-full w-full object-cover" loading="lazy"
              src={item.type==='video'?cldVideoPoster(item.url,{w:128,h:128}):cldImage(item.url,{w:128,h:128})}/>
          </button>)}
        </div>
      </div>
    </div>}
  </>
}
