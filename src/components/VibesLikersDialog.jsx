import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {Link} from 'react-router-dom'
import {Heart,X} from 'lucide-react'
import {api} from '../lib/api.js'
import {cldImage} from '../lib/cloudinary.js'

// Visible Vibes may show their likers to any signed-in member. The server
// rechecks post visibility on every page; it never exposes email or user ID.
export default function VibesLikersDialog({post,onClose}){
  const [people,setPeople]=useState([])
  const [nextPage,setNextPage]=useState(null)
  const [loading,setLoading]=useState(true),[error,setError]=useState('')
  const closeRef=useRef(null),working=useRef(false)
  useEffect(()=>{
    const old=document.body.style.overflow
    const prior=document.activeElement
    document.body.style.overflow='hidden'
    closeRef.current?.focus()
    const key=event=>{if(event.key==='Escape'){event.stopPropagation();onClose()}}
    window.addEventListener('keydown',key)
    return()=>{
      window.removeEventListener('keydown',key)
      document.body.style.overflow=old
      if(prior?.isConnected)prior.focus?.()
    }
  },[onClose])
  useEffect(()=>{
    let live=true
    working.current=true
    setLoading(true);setError('');setPeople([]);setNextPage(null)
    api.getVibeLikers(post.id,0).then(data=>{
      if(live){setPeople(data.people||[]);setNextPage(data.nextPage??null)}
    }).catch(err=>{if(live)setError(err.message||'Could not show likes.')})
      .finally(()=>{if(live){working.current=false;setLoading(false)}})
    return()=>{live=false}
  },[post.id])
  async function more(){
    if(nextPage==null||working.current)return
    working.current=true;setLoading(true);setError('')
    try{
      const result=await api.getVibeLikers(post.id,nextPage)
      setPeople(current=>{
        const seen=new Set(current.map(x=>x.username))
        return [...current,...(result.people||[]).filter(x=>!seen.has(x.username))]
      })
      setNextPage(result.nextPage??null)
    }catch(err){setError(err.message||'Could not show more likes.')}
    finally{setLoading(false);working.current=false}
  }
  return createPortal(
    <div role="presentation" onClick={event=>{if(event.target===event.currentTarget)onClose()}}
      className="fixed inset-0 z-[110] flex items-end justify-center bg-[#080D28]/75 backdrop-blur-[3px] sm:items-center sm:p-4">
      <section role="dialog" aria-modal="true" aria-label="People who liked this Vibe"
        className="flex max-h-[85dvh] w-full max-w-[440px] flex-col overflow-hidden rounded-t-[24px] border border-[#DCE0FB] bg-[#F7F3EB] shadow-2xl sm:rounded-[24px]">
        <header className="flex items-center gap-3 border-b border-[#E5E8FC] bg-white p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#E7EAFF] text-[#0A13E6]"><Heart size={19}/></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-black">People who liked this Vibe</h2>
            <p className="text-[11px] text-black/50">Open a person's profile</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close Vibes likes"
            className="grid h-10 w-10 place-items-center rounded-full border border-black/10"><X size={18}/></button>
        </header>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3" aria-live="polite">
          {people.map(person=><Link key={person.username} to={'/profile/'+encodeURIComponent(person.username)}
            onClick={onClose} className="flex min-h-14 items-center gap-3 rounded-xl p-2 hover:bg-white focus-visible:bg-white">
            {person.avatarUrl?<img src={cldImage(person.avatarUrl,{w:96,h:96})} alt="" loading="lazy" className="h-11 w-11 rounded-full object-cover"/>:
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[#0A13E6] font-black text-white">{(person.name||person.username)?.[0]?.toUpperCase()}</span>}
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[13px]">{person.name||person.username}</strong>
              <span className="block truncate text-[11px] text-black/50">^{person.username}</span>
            </span>
          </Link>)}
          {!loading&&!error&&people.length===0&&<p className="py-9 text-center text-[12px] text-black/55">No likes yet.</p>}
          {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-[12px] text-red-700">{error}</p>}
          {loading&&<p role="status" className="py-3 text-center text-[12px] text-black/45">Loading likes…</p>}
          {nextPage!=null&&!loading&&<button type="button" onClick={more}
            className="mx-auto block min-h-10 rounded-full border border-black/10 bg-white px-5 text-[12px] font-bold">
            Show more people
          </button>}
        </div>
      </section>
    </div>,document.body
  )
}
