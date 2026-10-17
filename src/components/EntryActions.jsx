import {useEffect,useRef,useState} from 'react'
import {MoreVertical,Pencil,Trash2} from 'lucide-react'

// Works with touch hold and right-click, but always keeps a keyboard-
// accessible three-dots button. No permanently visible destructive control.
export default function EntryActions({onEdit,onDelete,label='message'}){
 const [open,setOpen]=useState(false)
 const timer=useRef(null)
 useEffect(()=>()=>clearTimeout(timer.current),[])
 return <div className="relative shrink-0" onContextMenu={e=>{e.preventDefault();setOpen(true)}}
   onTouchStart={()=>{clearTimeout(timer.current);timer.current=setTimeout(()=>setOpen(true),550)}}
   onTouchEnd={()=>clearTimeout(timer.current)}
   onTouchMove={()=>clearTimeout(timer.current)}>
   <button type="button" aria-label={`Options for ${label}`} aria-haspopup="menu"
     aria-expanded={open} onClick={()=>setOpen(v=>!v)}
     className="grid h-9 w-9 place-items-center rounded-full text-black/50 hover:bg-black/5">
     <MoreVertical size={18}/>
   </button>
   {open&&<div role="menu" aria-label={`Actions for ${label}`}
     className="absolute right-0 top-full z-40 min-w-32 rounded-xl border border-black/15 bg-white p-1 shadow-lg">
     <button type="button" role="menuitem" onClick={()=>{setOpen(false);onEdit()}}
       className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-[12px] hover:bg-black/5"><Pencil size={14}/> Edit</button>
     <button type="button" role="menuitem" onClick={()=>{setOpen(false);onDelete()}}
       className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-[12px] text-red-700 hover:bg-red-50"><Trash2 size={14}/> Delete</button>
   </div>}
 </div>
}