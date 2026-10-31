import {useState} from 'react'
import {Check,CheckCheck,Copy,CornerUpRight,Languages,Reply} from 'lucide-react'
import ForwardMessageDialog from './ForwardMessageDialog.jsx'

// All three private chat lanes share the same actions and status vocabulary.
// Translation intentionally has no model/API until the provider is approved.
export default function MessageActions({message,own=false,canReply=true,onReply,showRead=true}){
  const [forward,setForward]=useState(false),[notice,setNotice]=useState('')
  async function copy(){
    const content=String(message.body||'')
    try{
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(content)
      else {
        // Older mobile webviews may lack the async clipboard API.
        const textarea=document.createElement('textarea')
        textarea.value=content
        textarea.style.position='fixed';textarea.style.left='-9999px'
        document.body.appendChild(textarea)
        textarea.select()
        let copied=false
        try{copied=document.execCommand('copy')}
        finally{textarea.remove()}
        if(!copied)throw new Error('Clipboard unavailable')
      }
      setNotice('Copied')
    }catch{
      setNotice('Copy unavailable. Select the message text instead.')
    }
  }
  const readAt=message.read_at
  return <>
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
      {canReply&&<button type="button" onClick={()=>onReply?.(message)} aria-label={'Reply to '+message.body}
        className="inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 underline-offset-2 hover:underline"><Reply size={12}/> Reply</button>}
      <button type="button" onClick={copy} aria-label="Copy message"
        className="inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 hover:underline"><Copy size={12}/> Copy</button>
      <button type="button" onClick={()=>setForward(true)} aria-label="Forward message"
        className="inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 hover:underline"><CornerUpRight size={12}/> Forward</button>
      <button type="button" onClick={()=>setNotice('Translations are coming soon.')}
        aria-label="Translate message (coming soon)" className="inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 hover:underline">
        <Languages size={12}/> Translate
      </button>
      {own&&showRead&&<span aria-label={readAt?'Read receipt: seen':'Read receipt: sent'}
        title={readAt?'Read '+new Date(readAt).toLocaleString():'Sent · awaiting read confirmation'}
        className="ml-auto inline-flex items-center gap-1 font-bold opacity-80">
        {readAt?<CheckCheck size={13}/>:<Check size={13}/>} {readAt?'Seen':'Sent'}
      </span>}
    </div>
    {notice&&<p role="status" className="mt-1 text-[10px] font-semibold">{notice}</p>}
    {forward&&<ForwardMessageDialog body={message.body} onClose={()=>setForward(false)}/>}
  </>
}
