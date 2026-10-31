import {useEffect,useRef,useState} from 'react'
import {Check,CheckCheck,Copy,CornerUpRight,Languages,Reply} from 'lucide-react'
import ForwardMessageDialog from './ForwardMessageDialog.jsx'

// Normal message bubbles are clean: long-press (touch or mouse), right-click,
// or use Shift+F10 on the focused bubble for the actions menu. The keyboard
// fallback is reachable even on devices without long-press support.
export default function MessageActions({message,own=false,canReply=true,onReply,showRead=true,children}){
  const [menu,setMenu]=useState(false),[menuBelow,setMenuBelow]=useState(false),[forward,setForward]=useState(false),[notice,setNotice]=useState('')
  const root=useRef(null),timer=useRef(null),start=useRef(null)
  const clear=()=>{if(timer.current){clearTimeout(timer.current);timer.current=null}}
  function showMenu(){
    // Keep the actions inside the chat viewport rather than underneath
    // the channel switcher/header when the selected message is near the top.
    const top=root.current?.getBoundingClientRect()?.top ?? 0
    setMenuBelow(top<330)
    setMenu(true)
  }
  useEffect(()=>{
    function dismiss(e){if(root.current && !root.current.contains(e.target))setMenu(false)}
    function key(e){if(e.key==='Escape')setMenu(false)}
    document.addEventListener('pointerdown',dismiss)
    document.addEventListener('keydown',key)
    return ()=>{clear();document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',key)}
  },[])
  function pointerDown(e){
    if(e.button!==0||e.target.closest('button,a,input,textarea'))return
    clear()
    start.current={x:e.clientX,y:e.clientY}
    timer.current=setTimeout(()=>{showMenu();timer.current=null},550)
  }
  function pointerMove(e){
    if(!start.current)return
    if(Math.abs(e.clientX-start.current.x)>10||Math.abs(e.clientY-start.current.y)>10)clear()
  }
  function pointerEnd(){clear();start.current=null}
  async function copy(){
    const content=String(message.body||'')
    try{
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(content)
      else{
        const textarea=document.createElement('textarea')
        textarea.value=content
        textarea.style.position='fixed';textarea.style.left='-9999px'
        document.body.appendChild(textarea);textarea.select()
        let copied=false
        try{copied=document.execCommand('copy')}
        finally{textarea.remove()}
        if(!copied)throw new Error('Clipboard unavailable')
      }
      setNotice('Copied')
    }catch{setNotice('Copy unavailable. Select the message text instead.')}
    finally{setMenu(false)}
  }
  const readAt=message.read_at
  return <div ref={root} className="relative min-w-0"
    onContextMenu={e=>{e.preventDefault();showMenu()}}
    onPointerDown={pointerDown} onPointerMove={pointerMove}
    onPointerUp={pointerEnd} onPointerCancel={pointerEnd}
    onKeyDown={e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();showMenu()}}}>
    <div tabIndex={0} aria-label="Message. Press and hold or use the context menu key for actions."
      className="rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A13E6] touch-pan-y">
      {children}
    </div>
    {own&&showRead&&<span aria-label={readAt?'Read receipt: seen':'Read receipt: sent'}
      title={readAt?'Read '+new Date(readAt).toLocaleString():'Sent · awaiting read confirmation'}
      className="mt-1 flex items-center justify-end gap-1 text-[10px] font-semibold opacity-70">
      {readAt?<CheckCheck size={12}/>:<Check size={12}/>} {readAt?'Seen':'Sent'}
    </span>}
    {menu&&<div role="menu" aria-label="Message actions"
      className={`absolute left-1/2 z-30 flex max-w-[min(92vw,340px)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-2xl border border-black/10 bg-white p-1.5 text-black shadow-xl ${menuBelow ? "top-full mt-2" : "bottom-full mb-2"}`}>
      {canReply&&<button type="button" role="menuitem" onClick={()=>{onReply?.(message);setMenu(false)}}
        aria-label={'Reply to '+message.body} className="flex items-center gap-1 rounded-xl px-2.5 py-2 text-[11px] font-semibold hover:bg-blue-50">
        <Reply size={14}/> Reply
      </button>}
      <button type="button" role="menuitem" onClick={copy} aria-label="Copy message"
        className="flex items-center gap-1 rounded-xl px-2.5 py-2 text-[11px] font-semibold hover:bg-blue-50"><Copy size={14}/> Copy</button>
      <button type="button" role="menuitem" onClick={()=>{setForward(true);setMenu(false)}} aria-label="Forward message"
        className="flex items-center gap-1 rounded-xl px-2.5 py-2 text-[11px] font-semibold hover:bg-blue-50">
        <CornerUpRight size={14}/> Forward</button>
      <button type="button" role="menuitem" aria-label="Translate message (coming soon)"
        onClick={()=>{setNotice('Translations are coming soon.');setMenu(false)}}
        className="flex items-center gap-1 rounded-xl px-2.5 py-2 text-[11px] font-semibold hover:bg-blue-50">
        <Languages size={14}/> Translate</button>
    </div>}
    {notice&&<p role="status" className="mt-1 text-[10px] font-semibold">{notice}</p>}
    {forward&&<ForwardMessageDialog body={message.body} onClose={()=>setForward(false)}/>}
  </div>
}
