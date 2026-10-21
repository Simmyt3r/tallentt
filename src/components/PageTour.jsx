import {useEffect,useRef,useState} from 'react'
import {useLocation} from 'react-router-dom'
import {BookOpen,Check,EyeOff} from 'lucide-react'
import {useAuth} from '../context/AuthContext.jsx'
import {
  acknowledgePageTour,
  pageTourForPath,
  pageTourKey,
  shouldShowPageTour,
  stopAllPageTours,
} from '../lib/pageTour.js'

// One calm introduction the first time a signed-in subscriber visits a major
// screen. It never opens for sub-dialogs, forms inside deals or public routes.
// "Don't show me again" is a global opt-out for this account on this device.
export default function PageTour(){
  const {user}=useAuth()
  const {pathname}=useLocation()
  const [active,setActive]=useState(null)
  const gotItRef=useRef(null)
  const neverRef=useRef(null)
  const accountId=user?.id

  useEffect(()=>{
    if(!accountId){setActive(null);return undefined}
    const refresh=()=>{
      const page=pageTourForPath(pathname,user?.isAdmin===true)
      setActive(shouldShowPageTour(accountId,page)?page:null)
    }
    refresh()
    const onStorage=event=>{
      if(event.key===pageTourKey(accountId) || event.key===null)refresh()
    }
    window.addEventListener('storage',onStorage)
    return()=>window.removeEventListener('storage',onStorage)
  },[pathname,accountId,user?.isAdmin])

  function acknowledge(){
    if(!active||!accountId)return
    acknowledgePageTour(accountId,active.id)
    setActive(null)
  }
  function neverAgain(){
    if(!accountId)return
    stopAllPageTours(accountId)
    setActive(null)
  }

  useEffect(()=>{
    if(!active)return undefined
    const formerFocus=document.activeElement
    const oldOverflow=document.body.style.overflow
    document.body.style.overflow='hidden'
    gotItRef.current?.focus()
    const onKey=event=>{
      if(event.key==='Escape'){
        event.preventDefault()
        acknowledgePageTour(accountId,active.id)
        setActive(null)
      }
      if(event.key==='Tab'){
        const first=neverRef.current,last=gotItRef.current
        if(event.shiftKey && document.activeElement===first){
          event.preventDefault();last?.focus()
        }else if(!event.shiftKey && document.activeElement===last){
          event.preventDefault();first?.focus()
        }
      }
    }
    document.addEventListener('keydown',onKey)
    return()=>{
      document.removeEventListener('keydown',onKey)
      document.body.style.overflow=oldOverflow
      if(formerFocus?.isConnected)formerFocus.focus?.()
    }
  },[active,accountId])

  if(!active)return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/45 px-4 py-6 backdrop-blur-[2px]"
      data-testid="page-tour-backdrop">
      <section role="dialog" aria-modal="true" aria-labelledby="page-tour-title"
        aria-describedby="page-tour-description"
        data-testid="page-tour"
        className="w-full max-w-[420px] overflow-hidden rounded-[22px] border border-black/10 bg-white shadow-2xl">
        <div className="px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-2xl bg-[#EEF0FF] text-[#0A13E6]">
              <BookOpen size={20}/>
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#0A13E6]">Quick page guide</p>
              <p className="mt-0.5 text-[11px] font-medium text-black/45">A short introduction to this screen</p>
            </div>
          </div>
          <h2 id="page-tour-title" className="mt-5 text-[21px] font-black leading-tight tracking-tight text-black">
            {active.title}
          </h2>
          <p id="page-tour-description" className="mt-2 text-[13px] leading-relaxed text-black/70">
            {active.description}
          </p>
          <p className="mt-4 rounded-[13px] bg-[#F7F3EB] px-3.5 py-3 text-[12px] font-semibold text-black/70">
            {active.hint}
          </p>
          <button type="button" ref={gotItRef} onClick={acknowledge}
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#0A13E6] px-4 text-[13px] font-bold text-white hover:bg-[#080EBB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A13E6]">
            <Check size={17} aria-hidden="true"/> Got it
          </button>
          <button type="button" ref={neverRef} onClick={neverAgain}
            className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-black/15 bg-white px-4 text-[12px] font-semibold text-black/65 hover:bg-black/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A13E6]">
            <EyeOff size={15} aria-hidden="true"/> Don't show me again
          </button>
          <p className="mt-3 text-center text-[10.5px] leading-relaxed text-black/45">
            Got it hides this page's tip. Don't show me again turns off tips everywhere.
            Restart them anytime in Settings.
          </p>
        </div>
      </section>
    </div>
  )
}
