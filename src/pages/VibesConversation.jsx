import {useCallback,useEffect,useState} from 'react'
import {useLocation,useNavigate,useParams} from 'react-router-dom'
import {ArrowLeft,MessageCircle,RefreshCw} from 'lucide-react'
import {api} from '../lib/api.js'
import {useAuth} from '../context/AuthContext.jsx'
import {updateVibeReturnSnapshot} from './Vibes.jsx'
import VibesComments from '../components/VibesComments.jsx'

// Full-viewport discussion route. The original Vibe remains in the feed;
// don't duplicate the post, its media, or its action rows above the comments.
export default function VibesConversation(){
  const {postId}=useParams()
  const navigate=useNavigate()
  const location=useLocation()
  const closeComments=()=>location.state?.fromVibesFeed?navigate(-1):navigate('/vibes')
  const {user}=useAuth()
  const [post,setPost]=useState(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [refresh,setRefresh]=useState(0)

  // This route intentionally covers the shell, including its mobile bottom nav.
  // Lock the underlying feed without losing the scroll position restored on Back.
  useEffect(()=>{
    const oldBody=document.body.style.overflow
    const oldHtml=document.documentElement.style.overflow
    document.body.style.overflow='hidden'
    document.documentElement.style.overflow='hidden'
    return()=>{
      document.body.style.overflow=oldBody
      document.documentElement.style.overflow=oldHtml
    }
  },[])

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
    updateVibeReturnSnapshot(id,patch)
  },[])

  return <main className="fixed inset-0 z-[60] flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F7F3EB] text-black"
    aria-label="Vibe conversation page">
    <header className="w-full shrink-0 border-b border-black/10 bg-white">
      <div className="mx-auto flex w-full max-w-[800px] items-center gap-3 px-3 py-2 sm:px-5">
        <button type="button" onClick={closeComments} aria-label="Close comments and return to Vibes"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-black/5">
          <ArrowLeft size={20}/>
        </button>
        <div className="min-w-0">
          <h1 className="text-[16px] font-black text-[#151B38]">Comments</h1>
          <p className="text-[11px] text-black/50">{post ? `${post.replies||0} comments and replies` : 'Join the conversation'}</p>
        </div>
      </div>
    </header>
    {loading&&<p role="status" className="flex-1 px-4 py-12 text-center text-sm text-black/50">Opening conversation…</p>}
    {error&&<section role="alert" className="mx-auto w-full max-w-[720px] flex-1 px-4 py-12 text-center">
      <MessageCircle size={28} className="mx-auto mb-3 text-black/35"/>
      <p className="text-sm font-semibold">{error}</p>
      <button type="button" onClick={()=>setRefresh(value=>value+1)}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-xs font-bold text-[#0A13E6]">
        <RefreshCw size={15}/> Retry
      </button>
    </section>}
    {post&&<VibesComments post={post} me={user} onDelta={onDelta} fullScreen/>}
  </main>
}
