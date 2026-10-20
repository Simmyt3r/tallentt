import {useEffect,useRef,useState} from 'react'
import {Link,useSearchParams} from 'react-router-dom'
import {MessageCircle,Send,Search,ShieldCheck} from 'lucide-react'
import {api} from '../lib/api.js'
import {useAuth} from '../context/AuthContext.jsx'

export default function CommunityChats({ embedded = false, searchText = '' }){
 const {user}=useAuth()
 const [params,setParams]=useSearchParams()
 const setChatParams = next => setParams(embedded ? {tab:'associates',...next}:next)
 const [threads,setThreads]=useState([])
 const [people,setPeople]=useState([])
 const [search,setSearch]=useState('')
 const [selected,setSelected]=useState(null)
 const [message,setMessage]=useState('')
 const [sending,setSending]=useState(false)
 const [error,setError]=useState('')
 const [loading,setLoading]=useState(true)
 const [newUser,setNewUser]=useState(null)
 const end=useRef(null)
 const active=params.get('thread')
 const refresh=async()=>{
   const data=await api.getCommunityChats()
   setThreads(data.threads||[])
 }
 useEffect(()=>{
   let valid=true
   api.getCommunityChats().then(data=>{if(valid)setThreads(data.threads||[])})
     .catch(e=>{if(valid)setError(e.message||'Unable to load community conversations.')})
     .finally(()=>{if(valid)setLoading(false)})
   return()=>{valid=false}
 },[])
 useEffect(()=>{
   if(!active){setSelected(null);return undefined}
   let valid=true
   const load=async()=>{try{const data=await api.getCommunityThread(active);if(valid)setSelected(data)}catch(e){if(valid)setError(e.message||'Could not load conversation.')}}
   load()
   const poll=setInterval(()=>{if(document.visibilityState==='visible')load()},15000)
   return()=>{valid=false;clearInterval(poll)}
 },[active])
 useEffect(()=>{end.current?.scrollIntoView({block:'nearest'})},[selected?.messages?.length,active])
 useEffect(()=>{
   let valid=true
   if(search.trim().replace(/^[@^]+/,'').length<2){setPeople([]);return undefined}
   const id=setTimeout(()=>api.searchCommunityUsers(search.trim()).then(data=>{
     if(valid)setPeople(data.users||[])
   }).catch(()=>{}),350)
   return()=>{valid=false;clearTimeout(id)}
 },[search])
 async function start(){
   if(!newUser||!message.trim()||sending)return
   setSending(true);setError('')
   try{
     const data=await api.communityChatAction({action:'community_start',recipient_id:newUser.id,text:message})
     setNewUser(null);setSearch('');setMessage('')
     await refresh()
     setChatParams({thread:data.thread_id})
   }catch(e){setError(e.message||'Unable to send your request.')}
   finally{setSending(false)}
 }
 async function send(){
   if(!active||!message.trim()||sending)return
   setSending(true);setError('')
   try{
     await api.communityChatAction({action:'community_send',thread_id:active,text:message})
     setMessage('')
     const data=await api.getCommunityThread(active)
     setSelected(data)
     await refresh()
   }catch(e){setError(e.message||'Could not send message.')}
   finally{setSending(false)}
 }
 async function respond(decision){
   if(!active||sending)return
   setSending(true);setError('')
   try{
     await api.communityChatAction({action:'community_respond',thread_id:active,decision})
     await refresh()
     const data=await api.getCommunityThread(active);setSelected(data)
   }catch(e){setError(e.message||'Unable to respond to request.')}
   finally{setSending(false)}
 }
 const thread=selected?.thread
 const incoming=thread?.status==='pending'&&thread?.recipient_id===user?.id
 const accepted=thread?.status==='accepted'
 const composeReady=Boolean(newUser)||accepted
 const visibleThreads=threads.filter(item=>!searchText || [item.peer_username,item.peer_name,item.last_message].some(value=>String(value||'').toLowerCase().includes(searchText.toLowerCase().trim())))
 return <main className="mx-auto max-w-[950px] space-y-3 pb-12">
   {!embedded && <header className="sticky top-14 z-10 border-b border-black/10 bg-[#F7F3EB]/95 px-2 py-3 backdrop-blur md:top-16">
     <h1 className="text-[21px] font-black">Associates Chat</h1>
     <p className="text-[12px] text-black/55">Connect with associates. Job money stays in Bento Chat.</p>
   </header>}
   {!embedded && <div className="flex flex-wrap gap-2 px-2">
     <span className="rounded-full bg-[#0A13E6] px-4 py-2 text-[12px] font-bold text-white">Associates Chat</span>
     <Link to="/inbox?tab=bento" className="rounded-full border border-black/20 bg-white px-4 py-2 text-[12px] font-bold">Bento Chat</Link>
   </div>}
   {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-[12px] text-red-700">{error}</p>}
   <div className="grid min-h-[440px] gap-3 md:grid-cols-[270px_minmax(0,1fr)]">
     <aside className="rounded-2xl border border-black/10 bg-white p-3" aria-label="Subscribers and conversations">
       <label className="relative flex items-center">
         <Search size={16} className="absolute left-3 text-black/40"/>
         <input value={search} onChange={e=>setSearch(e.target.value)}
           aria-label="Search subscribers to start a chat"
           placeholder="Find Associate by username"
           className="h-10 w-full min-w-0 rounded-full border border-black/15 bg-[#F7F3EB] pl-9 pr-3 text-[12px] outline-none focus:border-[#0A13E6]"/>
       </label>
       {search.trim().length>1&&<div className="mt-3 space-y-1">
         <p className="text-[10px] font-bold uppercase text-black/45">Start a new chat</p>
         {people.map(person=><button key={person.id} type="button"
           onClick={()=>{setNewUser(person);setSelected(null);setChatParams({})}}
           className="block min-h-10 w-full rounded-xl px-3 text-left hover:bg-blue-50">
           <span className="block text-[12px] font-bold">{person.full_name||person.username}</span>
           <span className="text-[11px] text-black/45">^{person.username}</span>
         </button>)}
         {!people.length&&<p className="text-[11px] text-black/45">No matching subscribers.</p>}
       </div>}
       <h2 className="mt-4 text-[11px] font-bold uppercase tracking-wide text-black/45">Conversations</h2>
       {loading&&<p className="py-4 text-[12px] text-black/50">Loading conversations…</p>}
       {!loading&&!threads.length&&<p className="py-4 text-[12px] text-black/50">No associates yet. Send a request from Profile.</p>}
       {visibleThreads.map(item=><button key={item.id} type="button"
         onClick={()=>{setNewUser(null);setChatParams({thread:item.id});setMessage('')}}
         aria-current={active===item.id}
         className={`mt-1 block w-full rounded-xl px-3 py-3 text-left ${active===item.id?'bg-blue-50':'hover:bg-black/5'}`}>
         <span className="block truncate text-[12px] font-bold">^{item.peer_username}</span>
         <span className="block truncate text-[11px] text-black/55">{item.last_message||'Conversation request'}</span>
         <span className="text-[10px] font-semibold text-black/40">{item.status}</span>
       </button>)}
     </aside>
     <section className="flex min-h-[440px] min-w-0 flex-col rounded-2xl border border-black/10 bg-white" aria-label="Associates chat">
       <div className="border-b border-black/10 px-4 py-3">
         <h2 className="text-[15px] font-black">
           {newUser?'^'+newUser.username:thread?'^'+thread.peer_username:'Select a subscriber or conversation'}
         </h2>
         <p className="mt-1 flex items-center gap-1 text-[11px] text-black/55">
           <ShieldCheck size={13}/> Chat requests require consent. Messages here do not authorize payments or deals.
         </p>
       </div>
       <div className="min-h-[260px] flex-1 space-y-2 overflow-y-auto p-4" aria-label="Chat history">
         {newUser&&<p className="text-center text-[12px] text-black/55">Write one introduction. Further messages require the recipient's acceptance.</p>}
         {!newUser&&!thread&&<p className="text-center text-[12px] text-black/50">Messages are private to their participants.</p>}
         {selected?.messages?.map(m=><div key={m.id} className={`flex ${m.sender_id===user?.id?'justify-end':'justify-start'}`}>
           <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12px] ${m.sender_id===user?.id?'bg-[#0A13E6] text-white':'bg-[#F7F3EB] text-black'}`}>
             <p className="whitespace-pre-wrap break-words">{m.body}</p>
             <time className="mt-1 block text-[10px] opacity-65">{new Date(m.created_at).toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'})}</time>
           </div>
         </div>)}
         <div ref={end}/>
       </div>
       {incoming&&<div className="flex gap-2 border-t border-black/10 p-3">
         <button type="button" disabled={sending} onClick={()=>respond('accepted')}
           className="min-h-11 rounded-full bg-[#0A13E6] px-4 text-[12px] font-bold text-white">Accept chat</button>
         <button type="button" disabled={sending} onClick={()=>respond('declined')}
           className="min-h-11 rounded-full border border-black/15 px-4 text-[12px] font-bold">Decline</button>
         <button type="button" disabled={sending} onClick={()=>respond('blocked')}
           className="min-h-11 rounded-full border border-red-200 px-4 text-[12px] font-bold text-red-700">Block</button>
       </div>}
       {accepted&&!newUser&&<div className="border-t border-black/10 px-3 pt-2 text-right">
         <button type="button" disabled={sending}
           onClick={()=>{if(window.confirm('Block this subscriber and stop messaging?'))respond('blocked')}}
           className="rounded-full border border-red-200 px-3 py-2 text-[11px] font-bold text-red-700">
           Block subscriber
         </button>
       </div>}
       {composeReady?<form onSubmit={e=>{e.preventDefault();newUser?start():send()}}
         className="flex items-end gap-2 border-t border-black/10 p-3">
         <label htmlFor="community-compose" className="sr-only">Write a community message</label>
         <textarea id="community-compose" value={message} onChange={e=>setMessage(e.target.value)}
           rows={2} maxLength={2000} placeholder={newUser?'Introduce yourself…':'Write a message…'}
           className="min-h-11 min-w-0 flex-1 resize-y rounded-xl border border-black/15 bg-[#F7F3EB] p-3 text-[12px] outline-none focus:border-[#0A13E6]"/>
         <button type="submit" disabled={sending||!message.trim()}
           aria-label={newUser?'Send chat request':'Send message'}
           className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#0A13E6] text-white disabled:opacity-40">
           <Send size={17}/>
         </button>
       </form>:thread&&<p className="border-t border-black/10 p-3 text-center text-[12px] text-black/55">
         {thread.status==='pending'?'Chat request awaiting acceptance.':'This conversation is closed or blocked.'}
       </p>}
     </section>
   </div>
 </main>
}
