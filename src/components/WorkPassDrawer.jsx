import { useEffect } from 'react'
import WorkPass from './WorkPass.jsx'
export default function WorkPassDrawer({username,onClose}){
  useEffect(()=>{
    const key=e=>{if(e.key==='Escape')onClose()}
    window.addEventListener('keydown',key)
    document.body.style.overflow='hidden'
    return()=>{window.removeEventListener('keydown',key);document.body.style.overflow=''}
  },[onClose])
  return <div role="presentation" onClick={onClose} className="fixed inset-0 z-[90] flex items-end justify-center bg-black/55">
    <div role="dialog" aria-modal="true" aria-label="My Work Pass" onClick={e=>e.stopPropagation()}
      className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-[#F7F3EB] p-4 sm:p-6">
      <WorkPass username={username} onClose={onClose}/>
    </div>
  </div>
}
