import {useEffect,useMemo,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {Check,Copy,Facebook,Linkedin,Mail,MessageCircle,Send,Share2,Twitter,X} from 'lucide-react'
import {cldImage,cldVideoPoster} from '../lib/cloudinary.js'
import {vibeShareDestinations,vibeShareText,vibeShareUrl} from '../lib/vibeSharing.js'

const ICONS={whatsapp:MessageCircle,facebook:Facebook,x:Twitter,telegram:Send,linkedin:Linkedin,email:Mail}
const STYLE={
  whatsapp:'bg-[#E5F9E9] text-[#146B31]',
  facebook:'bg-[#EBF1FF] text-[#0A54C9]',
  x:'bg-[#EEF0F3] text-[#121827]',
  telegram:'bg-[#E7F4FF] text-[#1781B9]',
  linkedin:'bg-[#E8F0FC] text-[#0A66C2]',
  email:'bg-[#F8EBE6] text-[#8D4D2F]',
}
async function copyUrl(value){
  if(navigator.clipboard?.writeText){
    try{await navigator.clipboard.writeText(value);return}
    catch {/* Use the editable DOM fallback for unsupported mobile browsers. */}
  }
  const input=document.createElement('textarea')
  input.value=value
  input.setAttribute('readonly','')
  input.style.position='fixed'
  input.style.left='-9999px'
  document.body.appendChild(input)
  input.select()
  let success=false
  try{success=document.execCommand('copy')}
  finally{input.remove()}
  if(!success)throw new Error('Automatic copying is unavailable. Select and copy the link below.')
}

export default function VibesShareDialog({post,onClose,onShared}){
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [copied,setCopied]=useState(false)
  const rootRef=useRef(null)
  const closeRef=useRef(null)
  const onCloseRef=useRef(onClose)
  onCloseRef.current=onClose
  const url=useMemo(()=>vibeShareUrl(post.id,window.location.origin),[post.id])
  const shareText=useMemo(()=>vibeShareText(post),[post])
  const destinations=useMemo(()=>vibeShareDestinations(url,shareText),[url,shareText])
  const firstMedia=post.media?.find(item=>item?.url)
  const image=firstMedia?.type==='image'?cldImage(firstMedia.url,{w:160,h:160})
    :firstMedia?.type==='video'?cldVideoPoster(firstMedia.url,{w:160,h:160}):null

  useEffect(()=>{
    const oldOverflow=document.body.style.overflow
    const prior=document.activeElement
    document.body.style.overflow='hidden'
    closeRef.current?.focus()
    function key(event){
      if(event.key==='Escape'){
        event.stopPropagation()
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if(event.key!=='Tab'||!rootRef.current)return
      const all=[...rootRef.current.querySelectorAll('button:not([disabled]),a[href],input:not([disabled])')]
        .filter(node=>node.getClientRects().length)
      if(!all.length)return
      const first=all[0],last=all[all.length-1]
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    }
    document.addEventListener('keydown',key)
    return()=>{
      document.removeEventListener('keydown',key)
      document.body.style.overflow=oldOverflow
      if(prior?.isConnected)prior.focus?.()
    }
  },[])

  function successfulShare(method,destination){
    onShared?.({method,destination})
  }
  async function copy(){
    if(busy)return
    setBusy('copy');setError('');setCopied(false)
    try{
      await copyUrl(url)
      setCopied(true)
      successfulShare('link','copy')
    }catch(e){setError(e.message||'Could not copy the link.')}
    finally{setBusy('')}
  }
  async function systemShare(){
    if(busy||!navigator.share)return
    setBusy('native');setError('')
    try{
      await navigator.share({title:'Vibe on ChombuTar',text:shareText,url})
      successfulShare('native','device')
      onCloseRef.current()
    }catch(e){if(e?.name!=='AbortError')setError('Device sharing was not completed. Try another destination.')}
    finally{setBusy('')}
  }
  function openDestination(destination){
    // Let the browser complete the anchor's native navigation before
    // unmounting the portal; otherwise some mobile browsers cancel the
    // destination when React removes the clicked link synchronously.
    // External sites cannot tell us whether the recipient actually posts.
    successfulShare('link',destination.id)
    window.setTimeout(()=>onCloseRef.current(),120)
  }

  return createPortal(
    <div role="presentation" onMouseDown={event=>{
      if(event.target===event.currentTarget)onCloseRef.current()
    }} className="fixed inset-0 z-[120] flex items-end justify-center bg-[#090F30]/75 p-0 backdrop-blur-[3px] sm:items-center sm:p-4">
      <section ref={rootRef} role="dialog" aria-modal="true" aria-label="Share this Vibe"
        className="flex max-h-[92dvh] w-full max-w-[490px] flex-col overflow-hidden rounded-t-[26px] border border-[#DCE1FF] bg-[#F7F3EB] shadow-[0_28px_95px_rgba(0,0,0,.3)] sm:rounded-[26px]">
        <header className="flex shrink-0 items-center gap-3 border-b border-[#E2E6FA] bg-white p-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#E8EDFF] text-[#0A13E6]"><Share2 size={20}/></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-black text-[#121936]">Share this Vibe</h2>
            <p className="mt-0.5 text-[11px] text-black/50">Choose where to share this post</p>
          </div>
          <button type="button" ref={closeRef} onClick={onClose} aria-label="Close share options"
            className="grid h-10 w-10 place-items-center rounded-full border border-black/10 text-[#17203C] hover:bg-[#EDF0FF]"><X size={19}/></button>
        </header>
        <div className="min-h-0 space-y-4 overflow-y-auto p-4">
          <div className="flex items-center gap-3 rounded-2xl border border-[#E1E5FB] bg-white p-3">
            {image&&<img src={image} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" loading="lazy"/>}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-black text-[#131C45]">{post.full_name||post.username}</p>
              <p className="mt-1 line-clamp-2 break-words text-[11px] text-[#4B5673]">{post.body||'View this Vibe on ChombuTar'}</p>
              <p className="mt-1.5 text-[10px] font-semibold text-[#0A13E6]">ChombuTar · Hits & Vibes</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-3">
            {destinations.map(dest=>{
              const Icon=ICONS[dest.id]
              return <a key={dest.id} href={dest.href}
                {...(dest.id==='email'?{}:{target:'_blank',rel:'noopener noreferrer'})}
                onClick={()=>openDestination(dest)}
                aria-label={'Share on '+dest.label}
                className="flex min-h-[83px] flex-col items-center justify-center gap-2 rounded-2xl border border-black/5 bg-white px-2 py-3 text-center text-[11px] font-bold text-[#182147] shadow-sm hover:border-[#0A13E6]/35 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A13E6]">
                <span className={'grid h-10 w-10 place-items-center rounded-full '+STYLE[dest.id]}><Icon size={20} aria-hidden="true"/></span>
                {dest.label}
              </a>
            })}
          </div>
          {typeof navigator.share==='function'&&<button type="button" disabled={Boolean(busy)}
            onClick={systemShare} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#0A13E6] bg-white text-[12px] font-bold text-[#0A13E6] disabled:opacity-50">
            <Share2 size={17}/> {busy==='native'?'Opening device sharing…':'More apps · Device share'}
          </button>}
          <div className="rounded-2xl border border-[#E2E6FA] bg-white p-3">
            <label htmlFor={'vibes-share-url-'+post.id} className="block text-[11px] font-black text-[#182147]">Link to this Vibe</label>
            <div className="mt-2 flex items-center gap-2">
              <input id={'vibes-share-url-'+post.id} readOnly value={url} onFocus={event=>event.target.select()}
                className="min-w-0 flex-1 rounded-xl border border-[#E1E5F4] bg-[#F7F3EB] px-2 py-3 text-[11px] text-[#313C66]"/>
              <button type="button" onClick={copy} disabled={Boolean(busy)}
                aria-label="Copy Vibe link"
                className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[#0A13E6] px-3 text-[12px] font-bold text-white disabled:opacity-50">
                {copied?<Check size={16}/>:<Copy size={16}/>}
                {copied?'Copied':'Copy'}
              </button>
            </div>
          </div>
          {copied&&<p role="status" className="text-[12px] font-bold text-emerald-700">Link copied. You can paste it anywhere.</p>}
          {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-[12px] text-red-700">{error}</p>}
          <p className="text-[10px] leading-relaxed text-black/45">Links open the specific Vibe in ChombuTar. Recipients may need to sign in to view it.</p>
        </div>
      </section>
    </div>,document.body
  )
}
