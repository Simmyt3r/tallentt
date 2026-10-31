import {useEffect,useRef,useState} from 'react'
import {Trash2,X} from 'lucide-react'

// Opening a conversation is a normal tap. Removal is intentionally separate:
// press/hold, right-click, keyboard menu or horizontal swipe reveals the action.
// Nothing is removed until the subscriber confirms in Inbox.
export default function InboxConversationRow({item,selected,onOpen,onRemove}){
  const [actions,setActions]=useState(false)
  const timer=useRef(null),start=useRef(null),suppress=useRef(false)
  const close=()=>setActions(false)
  const clear=()=>{if(timer.current){clearTimeout(timer.current);timer.current=null}}
  useEffect(()=>()=>clear(),[])
  function pointerDown(e){
    if(e.button!==0)return
    clear()
    start.current={x:e.clientX,y:e.clientY}
    suppress.current=false
    timer.current=setTimeout(()=>{suppress.current=true;setActions(true);timer.current=null},550)
  }
  function pointerMove(e){
    if(!start.current)return
    const dx=e.clientX-start.current.x,dy=e.clientY-start.current.y
    if(Math.abs(dy)>12 || Math.abs(dx)>12)clear()
  }
  function pointerUp(e){
    clear()
    if(start.current){
      const dx=e.clientX-start.current.x,dy=e.clientY-start.current.y
      if(Math.abs(dx)>65 && Math.abs(dx)>Math.abs(dy)*1.5){
        suppress.current=true;setActions(true)
      }
    }
    start.current=null
  }
  function open(e){
    if(suppress.current){e.preventDefault();suppress.current=false;return}
    if(actions){close();return}
    onOpen()
  }
  return <li className={`group relative border-b border-black/[0.07] ${selected?'bg-blue-50':'hover:bg-black/[0.025]'}`}
    onContextMenu={e=>{e.preventDefault();clear();setActions(true)}}>
    <button type="button" onClick={open} onPointerDown={pointerDown}
      onPointerMove={pointerMove} onPointerUp={pointerUp}
      onPointerCancel={()=>{clear();start.current=null}}
      onKeyDown={e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();setActions(true)}}}
      aria-current={selected?'page':undefined}
      aria-label={'Open chat with '+(item.name||'subscriber')}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left touch-pan-y">
      <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-[#EEEFFC] text-lg font-bold text-[#0A13E6]">
        {item.peer_avatar?<img src={item.peer_avatar} alt="" className="h-full w-full object-cover"/>:
          String(item.name||'?').slice(0,1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <strong className="flex-1 truncate text-sm">{item.name||'Conversation'}</strong>
          {Number(item.unread_count)>0&&<span aria-label={item.unread_count+' unread'}
            className="rounded-full bg-[#0A13E6] px-1.5 py-0.5 text-[10px] text-white">{item.unread_count}</span>}
        </span>
        <span className={`mt-0.5 block truncate text-xs ${Number(item.unread_count)>0?'font-semibold text-black/80':'text-black/45'}`}>
          {item.last_message||item.hat_title||'Chat request'}
        </span>
        <span className="mt-1 flex gap-2 text-[10px] text-black/40">
          <span className="min-w-0 truncate">{item.channels.join(' · ')}{item.threads.length>1?' ('+item.threads.length+' chats)':''}</span>
          {item.last_at&&<time className="ml-auto shrink-0">{new Date(item.last_at).toLocaleDateString([],{month:'short',day:'numeric'})}</time>}
        </span>
      </span>
    </button>
    {actions&&<div className="absolute inset-y-0 right-0 z-10 flex items-center gap-2 border-l border-black/10 bg-[#F7F3EB] px-3 shadow-[-8px_0_16px_-12px_rgba(0,0,0,.25)]">
      <button type="button" aria-label={'Remove chat with '+(item.name||'subscriber')}
        className="flex min-h-11 items-center gap-1.5 rounded-xl bg-red-50 px-3 text-xs font-bold text-red-700 hover:bg-red-100"
        onClick={()=>{close();onRemove(item)}}>
        <Trash2 size={16}/> Remove
      </button>
      <button type="button" aria-label="Close chat actions" onClick={close}
        className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5"><X size={18}/></button>
    </div>}
  </li>
}
