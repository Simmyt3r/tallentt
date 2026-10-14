import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Heart, ImagePlus, MessageCircle, Send, Trash2, Flag, Share2, X, RefreshCw } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { api, uploadVibePhoto } from '../lib/api.js'
import { compressImageFile } from '../lib/media.js'
import { cldImage } from '../lib/cloudinary.js'

const MAX_PHOTOS = 4
const dateText = value => {
  try { return new Date(value).toLocaleString([], {dateStyle:'medium',timeStyle:'short'}) }
  catch { return '' }
}

function Avatar({user,size=40}) {
  const image=user.avatar_url || user.avatarUrl
  return <span className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-[#0A13E6] text-white font-bold"
    style={{width:size,height:size}}>
    {image ? <img src={cldImage(image,{w:size*2,h:size*2})} alt="" className="h-full w-full object-cover" /> :
      String(user.full_name||user.fullName||user.username||'U').slice(0,1).toUpperCase()}
  </span>
}

function Identity({user}) {
  return <Link to={`/profile/${encodeURIComponent(user.username || '')}`}
    className="min-w-0 flex items-center gap-2.5 group">
    <Avatar user={user} />
    <span className="min-w-0 block">
      <span className="block truncate text-[13px] font-black group-hover:underline">{user.full_name||user.username}</span>
      <span className="block truncate text-[11px] text-black/50">@{user.username}</span>
    </span>
  </Link>
}

function Replies({post,me,onDelta}) {
  const [comments,setComments]=useState([])
  const [cursor,setCursor]=useState(null)
  const [text,setText]=useState('')
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  async function fetchPage(before) {
    setLoading(true)
    setError('')
    try {
      const data=await api.getVibeReplies(post.id,before)
      setComments(current=> before
        ? [...current,...(data.comments||[]).filter(row=>!current.some(c=>c.id===row.id))]
        : data.comments||[])
      setCursor(data.nextCursor || null)
    } catch(err){setError(err.message||'Could not load replies.')}
    finally {setLoading(false)}
  }
  useEffect(()=>{fetchPage(null)},[post.id])
  async function submit(e) {
    e.preventDefault()
    if(!text.trim()||busy)return
    setBusy(true);setError('')
    try {
      await api.vibeAction({action:'reply',post_id:post.id,text:text.trim()})
      setText('')
      onDelta(post.id,{replies:Number(post.replies||0)+1})
      await fetchPage(null)
    } catch(err){setError(err.message||'Could not post your reply.')}
    finally {setBusy(false)}
  }
  async function remove(item) {
    if(!window.confirm('Delete your reply?')) return
    setError('')
    try {
      await api.vibeAction({action:'delete_reply',post_id:post.id,comment_id:item.id})
      setComments(current=>current.filter(row=>row.id!==item.id))
      onDelta(post.id,{replies:Math.max(0,Number(post.replies||0)-1)})
    } catch(err){setError(err.message||'Could not delete this reply.')}
  }
  return <section aria-label="Replies" className="mt-3 border-t border-black/10 pt-3">
    <form onSubmit={submit} className="flex items-start gap-2">
      <Avatar user={me} size={32} />
      <div className="flex-1 min-w-0 flex gap-2">
        <label className="sr-only" htmlFor={`vibe-reply-${post.id}`}>Write a reply</label>
        <input id={`vibe-reply-${post.id}`} value={text} maxLength={300}
          onChange={e=>setText(e.target.value)} placeholder="Write a reply…"
          className="min-w-0 flex-1 h-10 rounded-full border border-black/15 bg-[#F7F3EB] px-4 text-[12px] outline-none focus:border-[#0A13E6]" />
        <button type="submit" disabled={!text.trim()||busy} aria-label="Send reply"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#0A13E6] text-white disabled:opacity-40">
          <Send size={17}/></button>
      </div>
    </form>
    {error&&<p role="alert" className="mt-2 text-[12px] text-red-700">{error}</p>}
    {loading&&!comments.length&&<p role="status" className="py-3 text-[12px] text-black/40">Loading replies…</p>}
    {!loading&&!comments.length&&<p className="py-3 text-[12px] text-black/40">Be the first to reply.</p>}
    <div className="mt-3 space-y-3">
      {comments.map(item=><div key={item.id} className="flex items-start gap-2">
        <Avatar user={item} size={30}/>
        <div className="flex-1 min-w-0 rounded-2xl bg-[#F7F3EB] px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/profile/${encodeURIComponent(item.username)}`} className="text-[12px] font-black hover:underline">{item.full_name||item.username}</Link>
            <span className="text-[10px] text-black/40">{dateText(item.created_at)}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-[12px]">{item.body}</p>
        </div>
        {me.id===item.author_id&&<button type="button" aria-label="Delete reply"
          onClick={()=>remove(item)} className="h-9 w-9 grid place-items-center text-black/50 hover:text-red-600"><Trash2 size={15}/></button>}
      </div>)}
    </div>
    {cursor&&<button type="button" disabled={loading} onClick={()=>fetchPage(cursor)}
      className="mt-3 w-full h-10 rounded-xl border border-black/15 text-[12px] font-semibold">Load older replies</button>}
  </section>
}

function VibeCard({post,me,onChange,onDeleted}) {
  const [showReplies,setShowReplies]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [reported,setReported]=useState(false)
  async function like() {
    if(busy)return
    setBusy(true)
    try { const data=await api.vibeAction({action:'like',post_id:post.id})
      onChange(post.id,{likes:data.likes,liked_by_me:data.liked})
    } catch(err){setError(err.message||'Could not update like.')}
    finally {setBusy(false)}
  }
  async function remove() {
    if(!window.confirm('Delete this Vibe and its replies?'))return
    setBusy(true)
    try{await api.vibeAction({action:'delete',post_id:post.id});onDeleted(post.id)}
    catch(err){setError(err.message||'Could not delete post.');setBusy(false)}
  }
  async function report() {
    const reason=window.prompt('Report this post as: spam, harassment, unsafe or other')
    if(reason===null)return
    if(!['spam','harassment','unsafe','other'].includes(reason.trim().toLowerCase())){
      setError('Choose spam, harassment, unsafe or other.');return
    }
    try {
      await api.vibeAction({action:'report',post_id:post.id,reason:reason.trim().toLowerCase()})
      setReported(true)
    } catch(err){setError(err.message||'Could not report this post.')}
  }
  async function share() {
    const url=new URL('/vibes?post='+post.id,window.location.origin).toString()
    try {
      if(navigator.share) await navigator.share({title:'Vibes on chombuTar',url})
      else {await navigator.clipboard.writeText(url);setError('Link copied.')}
    } catch(err){if(err.name!=='AbortError')setError('Unable to share this link.')}
  }
  return <article className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm" aria-label={`Vibe by ${post.full_name||post.username}`}>
    <header className="flex items-center justify-between gap-2">
      <Identity user={post}/>
      <div className="flex items-center gap-1">
        <time className="text-[10px] text-black/40" dateTime={post.created_at}>{dateText(post.created_at)}</time>
        {post.author_id===me.id?<button type="button" onClick={remove} disabled={busy}
          title="Delete your Vibe" aria-label="Delete Vibe" className="grid h-9 w-9 place-items-center text-black/40 hover:text-red-600">
          <Trash2 size={17}/></button>:
          <button type="button" onClick={report} disabled={reported}
            title="Report Vibe" aria-label="Report Vibe" className="grid h-9 w-9 place-items-center text-black/40 hover:text-red-600 disabled:opacity-30">
            <Flag size={17}/></button>}
      </div>
    </header>
    {post.body&&<p className="mt-3 whitespace-pre-wrap break-words text-[14px] leading-relaxed">{post.body}</p>}
    {Array.isArray(post.media)&&post.media.length>0&&<div
      className={`mt-3 grid gap-1 overflow-hidden rounded-xl ${post.media.length>1?'grid-cols-2':'grid-cols-1'}`}>
      {post.media.map((photo,i)=><a key={photo.public_id||i} href={photo.url}
        target="_blank" rel="noopener noreferrer" aria-label={`Open photo ${i+1}`}>
        <img src={cldImage(photo.url,{w:780,h:780})} loading="lazy"
          alt={`Photo ${i+1} attached to a Vibe by ${post.username}`}
          className={`w-full object-cover bg-[#F7F3EB] ${post.media.length===1?'max-h-[440px]':'h-[174px] sm:h-[220px]'}`} />
      </a>)}
    </div>}
    <div className="mt-3 grid grid-cols-3 gap-1 border-t border-black/10 pt-2">
      <button type="button" onClick={like} disabled={busy} aria-pressed={post.liked_by_me}
        aria-label={post.liked_by_me?'Unlike Vibe':'Like Vibe'}
        className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-[12px] font-semibold hover:bg-[#F7F3EB] ${post.liked_by_me?'text-[#0A13E6]':'text-black/55'}`}>
        <Heart size={17} fill={post.liked_by_me?'currentColor':'none'}/>{post.likes||0}
      </button>
      <button type="button" aria-label={`Replies (${post.replies||0})`} aria-expanded={showReplies} onClick={()=>setShowReplies(!showReplies)}
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl text-[12px] font-semibold text-black/55 hover:bg-[#F7F3EB]">
        <MessageCircle size={17}/>{post.replies||0} <span className="hidden sm:inline">Replies</span>
      </button>
      <button type="button" onClick={share}
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl text-[12px] font-semibold text-black/55 hover:bg-[#F7F3EB]">
        <Share2 size={17}/> Share
      </button>
    </div>
    {error&&<p role="status" className="mt-2 text-[11px] text-black/60">{error}</p>}
    {showReplies&&<Replies post={post} me={me} onDelta={onChange}/>}
  </article>
}

export default function Vibes() {
  const {user}=useAuth()
  const [params]=useSearchParams()
  const specific=params.get('post')||null
  const [posts,setPosts]=useState([])
  const [cursor,setCursor]=useState(null)
  const [loading,setLoading]=useState(true)
  const [paging,setPaging]=useState(false)
  const [error,setError]=useState('')
  const [text,setText]=useState('')
  const [photos,setPhotos]=useState([])
  const photosRef=useRef([])
  const fileRef=useRef(null)
  const [publishing,setPublishing]=useState(false)
  const [postError,setPostError]=useState('')
  const [feedTick,setFeedTick]=useState(0)

  useEffect(()=>{photosRef.current=photos},[photos])
  useEffect(()=>()=>photosRef.current.forEach(item=>URL.revokeObjectURL(item.preview)),[])
  useEffect(()=>{
    let cancelled=false
    setLoading(true);setError('')
    api.getVibes(null,specific).then(data=>{
      if(!cancelled){setPosts(data.posts||[]);setCursor(data.nextCursor||null)}
    }).catch(err=>{if(!cancelled)setError(err.message||'Could not load Vibes.')})
      .finally(()=>{if(!cancelled)setLoading(false)})
    return()=>{cancelled=true}
  },[specific,feedTick])

  function choosePhotos(e) {
    const files=[...e.target.files||[]]
    e.target.value=''
    if(!files.length)return
    if(photos.length+files.length>MAX_PHOTOS) {
      setPostError('You can attach at most four photos.');return
    }
    for(const file of files) {
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024||!file.size){
        setPostError('Use JPG, PNG or WebP photos, 8MB maximum each.');return
      }
    }
    setPostError('')
    setPhotos(current=>[...current,...files.map(file=>({
      file,id:crypto.randomUUID(),preview:URL.createObjectURL(file),
    }))])
  }

  async function publish(e) {
    e.preventDefault()
    if(publishing||(!text.trim()&&!photos.length))return
    setPublishing(true);setPostError('')
    try {
      const uploads=[]
      for(const item of photos){
        const file=await compressImageFile(item.file)
        uploads.push(await uploadVibePhoto(file))
      }
      await api.publishVibe(text.trim(),uploads)
      photos.forEach(item=>URL.revokeObjectURL(item.preview))
      setPhotos([]);setText('')
      setFeedTick(current=>current+1)
    } catch(err){setPostError(err.message||'Could not publish this Vibe.')}
    finally{setPublishing(false)}
  }
  async function older(){
    if(!cursor||paging)return
    setPaging(true)
    try{
      const data=await api.getVibes(cursor)
      setPosts(current=>[...current,...(data.posts||[]).filter(item=>!current.some(p=>p.id===item.id))])
      setCursor(data.nextCursor||null)
    }catch(err){setError(err.message||'Could not load more Vibes.')}
    finally{setPaging(false)}
  }
  const change=(id,patch)=>setPosts(current=>current.map(p=>p.id===id?{...p,...patch}:p))
  return <main className="mx-auto max-w-[660px] space-y-4 pb-10">
    <div className="flex items-end justify-between">
      <div>
        <h1 className="text-[23px] font-black tracking-tight">Hits & Vibes</h1>
        <p className="text-[12px] text-black/50">Share a moment. Meet the community.</p>
      </div>
      <span className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] font-bold">Vibes</span>
    </div>
    <form onSubmit={publish} aria-label="Create a Vibe" className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
      <div className="flex gap-3">
        <Avatar user={user}/>
        <div className="min-w-0 flex-1">
          <label htmlFor="vibe-text" className="sr-only">What’s on your mind?</label>
          <textarea id="vibe-text" value={text} onChange={e=>setText(e.target.value)}
            maxLength={500} rows={3} placeholder="What’s on your mind?"
            className="w-full resize-y rounded-xl border-0 bg-[#F7F3EB] p-3 text-[13px] outline-none focus:ring-2 focus:ring-[#0A13E6]"/>
          <div className="mt-1 text-right text-[10px] text-black/40">{text.length}/500</div>
        </div>
      </div>
      {photos.length>0&&<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {photos.map(item=><div key={item.id} className="relative">
          <img src={item.preview} alt="Photo ready to post" className="aspect-square w-full rounded-xl object-cover" />
          <button type="button" title="Remove photo" aria-label="Remove photo"
            disabled={publishing} onClick={()=>{
              URL.revokeObjectURL(item.preview)
              setPhotos(current=>current.filter(photo=>photo.id!==item.id))
            }} className="absolute top-1 right-1 grid h-8 w-8 place-items-center rounded-full bg-black/80 text-white">
            <X size={16}/></button>
        </div>)}
      </div>}
      {postError&&<p role="alert" className="mt-2 text-[12px] text-red-700">{postError}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-black/10 pt-3">
        <div>
          <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp"
            aria-label="Choose Vibes photos" className="hidden" onChange={choosePhotos}/>
          <button type="button" disabled={publishing||photos.length>=MAX_PHOTOS}
            onClick={()=>fileRef.current?.click()}
            className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[12px] font-bold text-[#0A13E6] hover:bg-blue-50 disabled:opacity-40">
            <ImagePlus size={19}/> Photo <span className="text-black/40">({photos.length}/4)</span>
          </button>
        </div>
        <button type="submit" disabled={publishing||(!text.trim()&&!photos.length)}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0A13E6] px-6 text-[12px] font-black text-white disabled:opacity-40">
          <Send size={16}/>{publishing?'Posting…':'Post Vibe'}
        </button>
      </div>
    </form>
    {specific&&<Link to="/vibes" className="block text-[12px] font-bold text-[#0A13E6]">← Back to all Vibes</Link>}
    {loading&&<p role="status" className="py-10 text-center text-[13px] text-black/50">Loading the community feed…</p>}
    {error&&<div role="alert" className="rounded-2xl border border-red-200 bg-white p-4 text-[12px] text-red-700">
      {error}<button type="button" onClick={()=>setFeedTick(current=>current+1)}
        className="ml-3 inline-flex items-center gap-1 underline"><RefreshCw size={14}/> Retry</button>
    </div>}
    {!loading&&!error&&!posts.length&&<div className="rounded-2xl border border-black/10 bg-white p-12 text-center">
      <MessageCircle size={26} className="mx-auto text-black/30"/>
      <p className="mt-3 text-[14px] font-black">Nothing here yet</p>
      <p className="mt-1 text-[12px] text-black/50">Start the conversation with your first Vibe.</p>
    </div>}
    {posts.map(post=><VibeCard key={post.id} post={post} me={user}
      onChange={change} onDeleted={id=>setPosts(current=>current.filter(p=>p.id!==id))}/>)}
    {cursor&&!specific&&<button type="button" disabled={paging} onClick={older}
      className="w-full min-h-11 rounded-xl border border-black/20 bg-white text-[12px] font-bold disabled:opacity-50">
      {paging?'Loading…':'Load more Vibes'}
    </button>}
  </main>
}
