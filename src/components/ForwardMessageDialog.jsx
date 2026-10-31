import {useEffect,useState} from 'react'
import {ArrowLeft,Send,X} from 'lucide-react'
import {api} from '../lib/api.js'

// Forwarding is an explicit *new* message to an accepted Associate thread.
// The existing community_send endpoint enforces target membership, status,
// rate limit, and blocked relationships. No source deal/HR records are moved.
export default function ForwardMessageDialog({body,onClose}){
  const [threads,setThreads]=useState([]),[loading,setLoading]=useState(true)
  const [selected,setSelected]=useState(''),[sending,setSending]=useState(false)
  const [error,setError]=useState('')
  const text='↪ Forwarded message\n'+String(body||'').trim()
  useEffect(()=>{
    let live=true
    api.getCommunityChats().then(data=>{
      if(live)setThreads((data.threads||[]).filter(t=>t.status==='accepted'))
    }).catch(err=>{if(live)setError(err.message||'Could not load your contacts.')})
      .finally(()=>{if(live)setLoading(false)})
    return()=>{live=false}
  },[])
  useEffect(()=>{
    const onKey=e=>{if(e.key==='Escape')onClose()}
    document.addEventListener('keydown',onKey)
    return()=>document.removeEventListener('keydown',onKey)
  },[onClose])
  async function send(e){
    e.preventDefault()
    if(!selected||sending)return
    if(text.length>2000){setError('This message is too long to forward. Use Copy instead.');return}
    setSending(true);setError('')
    try{
      await api.communityChatAction({action:'community_send',thread_id:selected,text})
      window.dispatchEvent(new Event('inbox:read'))
      onClose()
    }catch(err){setError(err.message||'Could not forward message.')}finally{setSending(false)}
  }
  return <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
    role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section role="dialog" aria-modal="true" aria-label="Forward message" className="flex max-h-[85dvh] w-full max-w-[420px] flex-col rounded-t-3xl bg-[#F7F3EB] p-4 shadow-2xl sm:rounded-3xl">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-black">Forward message</h2>
        <button type="button" onClick={onClose} aria-label="Close forward" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5"><X size={19}/></button>
      </div>
      <p className="my-3 max-h-24 overflow-auto rounded-xl border border-black/10 bg-white p-3 text-xs whitespace-pre-wrap break-words">{body}</p>
      <p className="mb-2 text-[11px] text-black/55">Choose an accepted Associate chat. Deal and employment records remain in their original conversation.</p>
      {loading?<p className="p-3 text-xs">Loading contacts…</p>:threads.length===0?<p className="rounded-xl bg-white p-4 text-xs text-black/60">No accepted Associate chats yet. Connect with someone in their Profile first.</p>:
        <form onSubmit={send} className="min-h-0 space-y-3">
          <div className="max-h-[35dvh] overflow-y-auto rounded-xl border border-black/10 bg-white p-2">
            {threads.map(t=><label key={t.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-blue-50">
              <input type="radio" name="forward-destination" checked={selected===t.id} onChange={()=>setSelected(t.id)}/>
              <span className="min-w-0 truncate text-sm font-semibold">{t.peer_name||t.peer_username}</span>
              <span className="ml-auto shrink-0 text-[10px] text-black/40">Associate</span>
            </label>)}
          </div>
          <button type="submit" disabled={!selected||sending||text.length>2000}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#0A13E6] text-sm font-bold text-white disabled:opacity-40">
            <Send size={16}/>{sending?'Forwarding…':'Forward to selected chat'}
          </button>
        </form>}
      {error&&<p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </section>
  </div>
}
