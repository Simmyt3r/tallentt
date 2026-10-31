import {useCallback,useEffect,useState} from 'react'
import {Link,useNavigate,useParams} from 'react-router-dom'
import {ArrowLeft,MessageCircle,RefreshCw} from 'lucide-react'
import {api} from '../lib/api.js'
import {useAuth} from '../context/AuthContext.jsx'
import {VibeCard} from './Vibes.jsx'
import VibesComments from '../components/VibesComments.jsx'

// A dedicated, addressable conversation screen instead of an expanding section
// on the feed. Shared post links keep their existing /vibes?post=... URLs.
export default function VibesConversation(){
  const {postId}=useParams()
  const navigate=useNavigate()
  const {user}=useAuth()
  const [post,setPost]=useState(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [refresh,setRefresh]=useState(0)
  useEffect(()=>{
    let alive=true
    setPost(null);setError('');setLoading(true)
    api.getVibes(null,postId).then(data=>{
      if(!alive)return
      const item=(data.posts||[]).find(entry=>entry.id===postId)
      if(item)setPost(item)
      else setError('This Vibe is no longer available.')
    }).catch(err=>{if(alive)setError(err.message||'Could not open this conversation.')})
      .finally(()=>{if(alive)setLoading(false)})
    return()=>{alive=false}
  },[postId,refresh])
  const onDelta=useCallback((id,patch)=>{
    setPost(current=>current?.id===id?{...current,...patch}:current)
  },[])
  return <main className="mx-auto max-w-[720px] space-y-3 pb-12" aria-label="Vibe conversation page">
    <header className="sticky top-14 z-10 -mx-4 flex items-center gap-3 border-b border-black/10 bg-[#F7F3EB]/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:rounded-xl md:border md:border-black/10">
      <Link to="/vibes" aria-label="Back to Hits & Vibes"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-black/5">
        <ArrowLeft size={20}/>
      </Link>
      <div className="min-w-0">
        <h1 className="text-lg font-black text-[#151B38]">Comments</h1>
        <p className="text-[11px] text-black/50">Join the conversation</p>
      </div>
    </header>
    {loading&&<p role="status" className="py-12 text-center text-sm text-black/50">Opening conversation…</p>}
    {error&&<section role="alert" className="rounded-2xl bg-white p-6 text-center">
      <MessageCircle size={28} className="mx-auto mb-3 text-black/35"/>
      <p className="text-sm font-semibold">{error}</p>
      <button type="button" onClick={()=>setRefresh(value=>value+1)}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-xs font-bold text-[#0A13E6]">
        <RefreshCw size={15}/> Retry
      </button>
    </section>}
    {post&&<>
      <VibeCard post={post} me={user} commentsPage onChange={onDelta}
        onDeleted={()=>navigate('/vibes',{replace:true})}/>
      <div className="rounded-2xl border border-black/10 bg-white px-4 pb-5 pt-2 shadow-sm"
        aria-label="Full-page comments">
        <VibesComments post={post} me={user} onDelta={onDelta}/>
      </div>
    </>}
  </main>
}
