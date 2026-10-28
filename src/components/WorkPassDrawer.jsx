import { useEffect, useRef } from 'react'
import WorkPass from './WorkPass.jsx'
export default function WorkPassDrawer({username,onClose}){
  const dialogRef=useRef(null)
  useEffect(()=>{
    const before=document.body.style.overflow
    document.body.style.overflow='hidden'
    const key=e=>{if(e.key==='Escape')onClose()}
    window.addEventListener('keydown',key)
    dialogRef.current?.focus()
    return()=>{window.removeEventListener('keydown',key);document.body.style.overflow=before}
  },[onClose])
  return <div role="presentation" onClick={onClose} className="fixed inset-0 z-[90] flex items-end justify-center bg-[#050B2A]/75 backdrop-blur-[3px] sm:items-center sm:p-4">
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="ChombuTar Work Pass" onClick={e=>e.stopPropagation()}
      className="max-h-[94dvh] w-full max-w-[760px] overflow-y-auto overscroll-contain rounded-t-[28px] bg-[#F7F3EB] px-3 pb-7 pt-3 shadow-2xl sm:max-h-[93dvh] sm:rounded-[30px] sm:p-5">
      <WorkPass username={username} onClose={onClose}/>
    </div>
  </div>
}
