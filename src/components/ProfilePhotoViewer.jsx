import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ImageOff, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react'
import { cldImage } from '../lib/cloudinary.js'

// One high-resolution, uncropped portrait viewer reused by profiles and Work Passes.
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n))
const origin=()=>({scale:1,x:0,y:0})
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)
const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2})

export default function ProfilePhotoViewer({src,name='Member',onClose}){
  const [position,setPosition]=useState(origin)
  const [loading,setLoading]=useState(true)
  const [failed,setFailed]=useState(false)
  const positionRef=useRef(origin())
  const touches=useRef(new Map())
  const gesture=useRef(null)
  const suppressBackdropClick=useRef(false)
  const closeButton=useRef(null)
  const label=String(name||'Member')
  const fullImage=cldImage(src,{w:2048,h:2048,crop:'limit'})

  const apply=useCallback(value=>{
    const scale=clamp(value.scale,1,5)
    const w=window.innerWidth*(scale-1)/2,h=window.innerHeight*(scale-1)/2
    const next={scale,x:scale===1?0:clamp(value.x,-w,w),y:scale===1?0:clamp(value.y,-h,h)}
    positionRef.current=next
    setPosition(next)
  },[])
  const zoom=delta=>apply({...positionRef.current,scale:positionRef.current.scale+delta})
  const reset=()=>apply(origin())

  useEffect(()=>{
    positionRef.current=origin();setPosition(origin())
    touches.current.clear();gesture.current=null
    setLoading(true);setFailed(false)
  },[src])
  useEffect(()=>{
    if(!src)return undefined
    const scrollBefore=document.body.style.overflow
    const focused=document.activeElement
    document.body.style.overflow='hidden'
    closeButton.current?.focus()
    return ()=>{
      document.body.style.overflow=scrollBefore
      if(focused instanceof HTMLElement && focused.isConnected)focused.focus()
    }
  },[src])

  function start(){
    const pts=[...touches.current.values()]
    if(pts.length===0){gesture.current=null;return}
    gesture.current=pts.length>1?
      {kind:'pinch',center:mid(pts[0],pts[1]),gap:Math.max(1,dist(pts[0],pts[1])),base:{...positionRef.current}}:
      {kind:'drag',center:pts[0],base:{...positionRef.current}}
  }
  function down(e){
    if(e.pointerType==='mouse'&&e.button!==0)return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    touches.current.set(e.pointerId,{x:e.clientX,y:e.clientY})
    suppressBackdropClick.current=false
    start()
  }
  function move(e){
    if(!touches.current.has(e.pointerId))return
    touches.current.set(e.pointerId,{x:e.clientX,y:e.clientY})
    const pts=[...touches.current.values()],g=gesture.current
    if(!g)return
    if(pts.some(p=>Math.hypot(p.x-g.center.x,p.y-g.center.y)>8))suppressBackdropClick.current=true
    if(pts.length>=2&&g.kind==='pinch'){
      const center=mid(pts[0],pts[1])
      apply({scale:g.base.scale*dist(pts[0],pts[1])/g.gap,
        x:g.base.x+center.x-g.center.x,y:g.base.y+center.y-g.center.y})
    }else if(pts.length===1&&g.kind==='drag'&&g.base.scale>1){
      apply({scale:g.base.scale,x:g.base.x+pts[0].x-g.center.x,y:g.base.y+pts[0].y-g.center.y})
    }
  }
  function up(e){touches.current.delete(e.pointerId);start()}
  function onKeys(e){
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose?.()}
    else if(e.key==='+'||e.key==='='){e.preventDefault();zoom(.5)}
    else if(e.key==='-'){e.preventDefault();zoom(-.5)}
    else if(e.key==='0'){e.preventDefault();reset()}
    else if(e.key==='Tab'){
      const buttons=[...e.currentTarget.querySelectorAll('button:not(:disabled)')]
      if(!buttons.length)return
      if(e.shiftKey&&document.activeElement===buttons[0]){e.preventDefault();buttons.at(-1).focus()}
      else if(!e.shiftKey&&document.activeElement===buttons.at(-1)){e.preventDefault();buttons[0].focus()}
    }
  }
  if(!src)return null
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={label+' full profile photo'}
      onKeyDown={onKeys}
      onClick={e=>{e.stopPropagation();if(e.target===e.currentTarget)onClose?.()}}
      className="fixed inset-0 z-[120] flex flex-col bg-[#05091B]/95 text-white backdrop-blur-sm">
      <div className="relative z-10 flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#080D28]/90 px-4 py-3 sm:px-6">
        <div className="min-w-0"><h2 className="truncate text-[14px] font-black">{label}</h2><p className="text-[11px] text-white/60">Full profile picture</p></div>
        <button ref={closeButton} type="button" aria-label="Close full profile photo" onClick={onClose}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/20 bg-white/10 hover:bg-white/20"><X size={21}/></button>
      </div>
      <div data-testid="profile-photo-viewport" onClick={e=>{
          if(e.target===e.currentTarget&&!suppressBackdropClick.current)onClose?.()
          suppressBackdropClick.current=false
        }} onPointerDown={down} onPointerMove={move}
        onPointerUp={up} onPointerCancel={up}
        onDoubleClick={()=>positionRef.current.scale>1?reset():zoom(1)}
        onWheel={e=>{if(!failed){e.preventDefault();zoom(e.deltaY<0?.3:-.3)}}}
        style={{touchAction:'none',cursor:position.scale>1?'grab':'zoom-in'}}
        className="relative flex min-h-0 flex-1 select-none items-center justify-center overflow-hidden p-3 sm:p-6">
        {loading&&!failed&&<p role="status" className="absolute text-xs text-white/70">Loading full-resolution photo…</p>}
        {failed?<div role="alert" className="flex flex-col items-center gap-3 text-center text-white/70">
          <ImageOff size={32}/><span className="text-xs">This profile photo could not be loaded.</span></div>:
          <img src={fullImage} alt={label+' full profile photo'} draggable={false}
            onLoad={()=>setLoading(false)} onError={()=>{setLoading(false);setFailed(true)}}
            style={{transform:`translate3d(${position.x}px,${position.y}px,0) scale(${position.scale})`,transformOrigin:'center'}}
            className="max-h-full max-w-full object-contain shadow-2xl" />}
      </div>
      <div className="relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-[#080D28]/90 px-4 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-6">
        <span className="text-[10px] text-white/55">Pinch, scroll or double-tap to zoom · Drag to move</span>
        <div className="flex items-center gap-2">
          <button type="button" disabled={failed||position.scale<=1} aria-label="Zoom out profile photo" onClick={()=>zoom(-.5)}
            className="grid h-10 w-10 place-items-center rounded-xl border border-white/20 bg-white/10 disabled:opacity-35"><ZoomOut size={18}/></button>
          <output className="min-w-12 text-center text-[11px] font-bold tabular-nums">{Math.round(position.scale*100)}%</output>
          <button type="button" disabled={failed||position.scale>=5} aria-label="Zoom in profile photo" onClick={()=>zoom(.5)}
            className="grid h-10 w-10 place-items-center rounded-xl border border-white/20 bg-white/10 disabled:opacity-35"><ZoomIn size={18}/></button>
          <button type="button" disabled={failed||position.scale===1} aria-label="Reset profile photo zoom" onClick={reset}
            className="grid h-10 w-10 place-items-center rounded-xl border border-white/20 bg-white/10 disabled:opacity-35"><RotateCcw size={17}/></button>
        </div>
      </div>
    </div>,document.body
  )
}
