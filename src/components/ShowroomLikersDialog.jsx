import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Heart, X } from 'lucide-react'
import { api } from '../lib/api.js'
import { cldImage } from '../lib/cloudinary.js'

// Only owners get this modal: the API repeats the ownership check on every
// page, so guessing a post ID cannot reveal a different person's likers.
export default function ShowroomLikersDialog({post,onClose}){
  const [people,setPeople]=useState([])
  const [nextPage,setNextPage]=useState(0)
  const [pending,setPending]=useState(false)
  const [error,setError]=useState('')
  const closeRef=useRef(null)
  const inFlight=useRef(false)
  const kind=post?.is_entertainment?'gallery':'hat'
  useEffect(()=>{
    const previous=document.body.style.overflow,focused=document.activeElement
    document.body.style.overflow='hidden'
    closeRef.current?.focus()
    return()=>{
      document.body.style.overflow=previous
      if(focused?.isConnected)focused.focus?.()
    }
  },[])
  useEffect(()=>{
    let live=true
    inFlight.current=true
    setPeople([]);setNextPage(0);setPending(true);setError('')
    api.getShowroomLikers(post.id,kind,0)
      .then(data=>{if(live){setPeople(data.people||[]);setNextPage(data.nextPage)}})
      .catch(err=>{if(live)setError(err.message||'Could not load likes.')})
      .finally(()=>{if(live){setPending(false);inFlight.current=false}})
    return()=>{live=false}
  },[post.id,kind])
  async function loadMore(){
    if(nextPage==null||inFlight.current)return
    inFlight.current=true;setPending(true);setError('')
    try{
      const data=await api.getShowroomLikers(post.id,kind,nextPage)
      setPeople(old=>[...old,...(data.people||[])])
      setNextPage(data.nextPage)
    }catch(err){setError(err.message||'Could not load more likes.')}
    finally{inFlight.current=false;setPending(false)}
  }
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-[#080D28]/75 p-0 backdrop-blur-[3px] sm:items-center sm:p-4"
      role="presentation" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <section role="dialog" aria-modal="true" aria-label="People who liked your Showroom post"
        onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose()}}}
        className="flex max-h-[85dvh] w-full max-w-[440px] flex-col overflow-hidden rounded-t-[24px] border border-black/10 bg-[#F7F3EB] shadow-2xl sm:rounded-[24px]">
        <header className="flex items-center gap-3 border-b border-black/10 bg-white p-4">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#E7EAFF] text-[#0A13E6]"><Heart size={19}/></span>
          <div className="min-w-0 flex-1"><h2 className="font-black text-[16px]">Liked your post</h2>
            <p className="text-[11px] text-black/50">People who currently like this Showroom post</p></div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close likes list"
            className="grid h-10 w-10 place-items-center rounded-full border border-black/10 bg-[#F7F3EB]"><X size={18}/></button>
        </header>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3" aria-live="polite">
          {people.map(person=><Link key={person.username}
            to={'/profile/'+encodeURIComponent(person.username)} onClick={onClose}
            className="flex min-h-14 items-center gap-3 rounded-xl p-2 transition-colors hover:bg-white focus-visible:bg-white">
            {person.avatarUrl?<img src={cldImage(person.avatarUrl,{w:96,h:96})} alt="" loading="lazy" className="h-11 w-11 rounded-full border border-black/10 object-cover"/>:
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[#0A13E6] font-black text-white">{(person.name||person.username)?.[0]?.toUpperCase()}</span>}
            <span className="min-w-0 flex-1"><strong className="block truncate text-[13px]">{person.name||person.username}</strong><span className="block truncate text-[11px] text-black/50">@{person.username}</span></span>
          </Link>)}
          {!pending&&!error&&people.length===0&&<p className="py-10 text-center text-[13px] text-black/55">No likes yet.</p>}
          {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
          {pending&&<p role="status" className="py-3 text-center text-[12px] text-black/50">Loading likes…</p>}
          {nextPage!=null&&!pending&&<button type="button" onClick={loadMore}
            className="mx-auto block min-h-10 rounded-full border border-black/10 bg-white px-5 text-xs font-bold">Show more people</button>}
        </div>
      </section>
    </div>,document.body
  )
}
