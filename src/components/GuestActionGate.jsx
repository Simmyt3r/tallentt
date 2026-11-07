import {useEffect,useRef} from 'react'
import {Link} from 'react-router-dom'
import {X,UserPlus,LogIn} from 'lucide-react'
import {guestAuthUrl} from '../lib/guestIntent.js'

export default function GuestActionGate({intent,onClose}){
  const closeRef=useRef(null)
  useEffect(()=>{
    if(!intent)return undefined
    closeRef.current?.focus()
    const dismiss=event=>{if(event.key==='Escape')onClose?.()}
    document.addEventListener('keydown',dismiss)
    return()=>document.removeEventListener('keydown',dismiss)
  },[intent,onClose])
  if(!intent)return null
  const action={
    keepup:'KeepUp',book:'Book',collab:'Collaborate with',hire:'Hire',sponsor:'Sponsor',
    like:'Like',save:'Save',share:'Share',comment:'Comment on',message:'Message',
  }[intent.intent]||'Connect with'
  const name=intent.name||intent.username
  const details={intent:intent.intent,username:intent.username,hat:intent.hat,resource:intent.resource||'hat'}
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4"
    onMouseDown={event=>{if(event.target===event.currentTarget)onClose?.()}}>
    <section role="dialog" aria-modal="true" aria-labelledby="guest-action-title"
      className="relative w-full max-w-[430px] rounded-[24px] bg-[#FFFDF7] p-6 shadow-2xl sm:p-8">
      <button ref={closeRef} type="button" onClick={onClose} aria-label="Keep looking"
        className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-black/5"><X size={19}/></button>
      <span className="text-[11px] font-extrabold uppercase tracking-[0.17em] text-amber-800">You are one step away</span>
      <h2 id="guest-action-title" className="mt-2 pr-8 text-[25px] font-black leading-tight">
        {action} {name}
      </h2>
      <p className="mt-3 text-[14px] leading-6 text-black/65">
        To {action.toLowerCase()} {name}, create your free account. You can keep looking without signing up.
        Your selected Talent will still be here when you return.
      </p>
      <div className="mt-6 grid gap-2">
        <Link className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#E8B447] px-5 text-[14px] font-extrabold text-black hover:bg-[#F1C86B]"
          to={guestAuthUrl('signup',details)}><UserPlus size={18}/>Sign Up — Free</Link>
        <Link className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-black/20 px-5 text-[14px] font-bold hover:bg-black/5"
          to={guestAuthUrl('login',details)}><LogIn size={18}/>Log In</Link>
        <button type="button" className="min-h-11 text-[13px] font-semibold text-black/60 underline underline-offset-4"
          onClick={onClose}>Keep Looking</button>
      </div>
      <p className="mt-3 text-center text-[11px] text-black/45">Looking as a guest never changes Orbit or sends money.</p>
    </section>
  </div>
}
