import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Heart, ImagePlus, MessageCircle, Send, Trash2, Flag, Share2, X, RefreshCw } from 'lucide-react'
import EntryActions from '../components/EntryActions.jsx'
import VibesMediaGallery from '../components/VibesMediaGallery.jsx'
import VibesComments from '../components/VibesComments.jsx'
import VibesLikersDialog from '../components/VibesLikersDialog.jsx'
import CompactPageHeader from '../components/CompactPageHeader.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { api, uploadVibePhoto } from '../lib/api.js'
import { compressImageFile } from '../lib/media.js'
import { cldImage } from '../lib/cloudinary.js'
import { shareSignedWorkPassVideo } from '../lib/workPassVideoShare.js'

const MAX_PHOTOS = 10
const MAX_POST_BYTES = 80 * 1024 * 1024
const dateText = value => {
  try { return new Date(value).toLocaleString([], {dateStyle:'medium',timeStyle:'short'}) }
  catch { return '' }
}

function Avatar({user,size=40}) {
  const image=user.avatar_url || user.avatarUrl
  return <span className="relative grid shrink-0 place-items-center rounded-full bg-[#0A13E6] text-white font-bold"
    style={{width:size,height:size}}>
    {image ? <img src={cldImage(image,{w:size*2,h:size*2})} alt="" className="h-full w-full rounded-full object-cover" /> :
      String(user.full_name||user.fullName||user.username||'U').slice(0,1).toUpperCase()}
    {user.is_online&&<span aria-label="Online" title="Online" className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-green-500"/>}
  </span>
}

function Identity({user}) {
  return <Link to={`/profile/${encodeURIComponent(user.username || '')}`}
    className="min-w-0 flex items-center gap-2.5 group">
    <Avatar user={user} />
    <span className="min-w-0 block">
      <span className="block truncate text-[13px] font-black group-hover:underline">{user.full_name||user.username}</span>
      <span className="block truncate text-[11px] text-black/50">{'^'+String(user.username||'').replace(/^[@^]+/,'')}</span>
    </span>
  </Link>
}


function VibeCard({post,me,onChange,onDeleted}) {
  const [showReplies,setShowReplies]=useState(false)
  const [showLikers,setShowLikers]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [reported,setReported]=useState(false)
  const [editingPost,setEditingPost]=useState(false)
  const [editBody,setEditBody]=useState(post.body||'')
  const [exporting,setExporting]=useState(false)
  const [exportProgress,setExportProgress]=useState(0)
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
  async function savePost(){
    setBusy(true);setError('')
    try{
      await api.vibeAction({action:'edit_post',post_id:post.id,text:editBody})
      onChange(post.id,{body:editBody.trim(),edited_at:new Date().toISOString()})
      setEditingPost(false)
    }catch(err){setError(err.message||'Could not edit post.')}
    finally{setBusy(false)}
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
  async function share(media = null) {
    const clip=media?.type==='video'?media:(post.media||[]).find(item=>item.type==='video')
    if(clip?.url){
      if(exporting)return
      setExporting(true);setExportProgress(0);setError('')
      try {
        const outcome=await shareSignedWorkPassVideo({url:clip.url,username:post.username,
          onProgress:setExportProgress})
        if(outcome==='downloaded')setError('Branded video saved. Share the downloaded file on WhatsApp or Instagram.')
      }catch(err){setError(err.message||'Could not export a branded clip.')}
      finally{setExporting(false)}
      return
    }
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
        {post.author_id===me.id?<EntryActions label="Vibe" onEdit={()=>{setEditBody(post.body||'');setEditingPost(true)}} onDelete={remove}/>:
          <button type="button" onClick={report} disabled={reported}
            title="Report Vibe" aria-label="Report Vibe" className="grid h-9 w-9 place-items-center text-black/40 hover:text-red-600 disabled:opacity-30">
            <Flag size={17}/></button>}
      </div>
    </header>
    {editingPost?<div className="mt-3 space-y-2"><textarea autoFocus rows={5} value={editBody} onChange={e=>setEditBody(e.target.value)} className="w-full resize-y rounded-xl border border-black/15 p-3 text-[13px]"/><div className="flex gap-2"><button type="button" disabled={busy||(!editBody.trim()&&!post.media?.length)} onClick={savePost} className="rounded-full bg-[#0A13E6] px-4 py-2 text-[12px] text-white">Save changes</button><button type="button" onClick={()=>setEditingPost(false)} className="text-[12px]">Cancel</button></div></div> : post.body&&<p className="mt-3 whitespace-pre-wrap break-words text-[14px] leading-relaxed">{post.body}{post.edited_at&&<span className="ml-1 text-[10px] text-black/40">(edited)</span>}</p>}
    <VibesMediaGallery media={post.media||[]} owner={post.full_name||post.username} onShareVideo={share} sharing={exporting}/>
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
      <button type="button" onClick={()=>share()} disabled={exporting}
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl text-[12px] font-semibold text-black/55 hover:bg-[#F7F3EB] disabled:opacity-50">
        <Share2 size={17}/> {exporting ? 'Branding '+exportProgress+'%' : (post.media||[]).some(m=>m.type==='video') ? 'Share branded clip' : 'Share'}
      </button>
    </div>
    {error&&<p role="status" className="mt-2 text-[11px] text-black/60">{error}</p>}
    <button type="button" onClick={()=>setShowLikers(true)}
      aria-label="See who liked this Vibe"
      className="mt-1 inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-[11px] font-bold text-[#0A13E6] hover:bg-[#EEF0FF] focus-visible:bg-[#EEF0FF]">
      <Heart size={13} fill="currentColor" aria-hidden="true"/>
      {Number(post.likes||0)===0?'See who liked this Vibe':`See who liked this Vibe · ${post.likes}`}
    </button>
    {showReplies&&<VibesComments post={post} me={me} onDelta={onChange}/>}
    {showLikers&&<VibesLikersDialog post={post} onClose={()=>setShowLikers(false)}/>}
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
  const [search,setSearch]=useState('')
  const [serverSearch,setServerSearch]=useState('')
  const photosRef=useRef([])
  const fileRef=useRef(null)
  const [publishing,setPublishing]=useState(false)
  const [postError,setPostError]=useState('')
  const [feedTick,setFeedTick]=useState(0)
  const [reviewingPost,setReviewingPost]=useState(null)

  useEffect(()=>{const id=setTimeout(()=>setServerSearch(search.trim()),250);return()=>clearTimeout(id)},[search])
  useEffect(()=>{
    if(!reviewingPost)return undefined
    let cancelled=false
    let attempts=0
    const interval=setInterval(async()=>{
      if(++attempts>7){clearInterval(interval);return}
      try{
        const result=await api.getVibeModerationStatus(reviewingPost)
        if(cancelled)return
        if(result.status==='visible'){
          clearInterval(interval)
          setReviewingPost(null)
          setPostError('Your media passed automated screening and is now published.')
          setFeedTick(t=>t+1)
        }
      }catch{/* Review queue is still available if screening is temporarily offline. */}
    },12000)
    return()=>{cancelled=true;clearInterval(interval)}
  },[reviewingPost])
  useEffect(()=>{photosRef.current=photos},[photos])
  useEffect(()=>()=>photosRef.current.forEach(item=>URL.revokeObjectURL(item.preview)),[])
  useEffect(()=>{
    let cancelled=false
    setLoading(true);setError('')
    api.getVibes(null,specific,serverSearch).then(data=>{
      if(!cancelled){setPosts(data.posts||[]);setCursor(data.nextCursor||null)}
    }).catch(err=>{if(!cancelled)setError(err.message||'Could not load Vibes.')})
      .finally(()=>{if(!cancelled)setLoading(false)})
    return()=>{cancelled=true}
  },[specific,feedTick,serverSearch])

  function choosePhotos(e) {
    const files=[...e.target.files||[]]
    e.target.value=''
    if(!files.length)return
    if(photos.length+files.length>MAX_PHOTOS) {
      setPostError('Choose up to ten files in a post. You can make another post for additional media.');return
    }
    const total=[...photos.map(item=>item.file),...files].reduce((sum,file)=>sum+file.size,0)
    if(total>MAX_POST_BYTES){
      setPostError('Choose up to 80 MB total media per post. Compress large videos or use another post.');return
    }
    for(const file of files) {
      if(!( ['image/jpeg','image/png','image/webp'].includes(file.type)&&file.size<=8*1024*1024 || ['video/mp4','video/webm','video/quicktime'].includes(file.type)&&file.size<=20*1024*1024 )||!file.size){
        setPostError('Choose a photo up to 8MB or a video up to 20MB.');return
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
      // Signed media uploads may run concurrently, but with a low ceiling to
      // avoid saturating subscribers' connections on mobile data.
      const uploads=new Array(photos.length)
      let next=0
      await Promise.all(Array.from({length:Math.min(3,photos.length)},async()=>{
        while(next<photos.length){
          const index=next++
          const item=photos[index]
          const file=item.file.type.startsWith('image/')
            ? await compressImageFile(item.file) : item.file
          uploads[index]=await uploadVibePhoto(file)
        }
      }))
      const result=await api.publishVibe(text.trim(),uploads)
      if(result.pending_review){
        setReviewingPost(result.id)
        setPostError('Safety screening is checking this upload. Uncertain content is flagged for review; approved content appears automatically.')
      }
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
      const data=await api.getVibes(cursor,null,serverSearch)
      setPosts(current=>[...current,...(data.posts||[]).filter(item=>!current.some(p=>p.id===item.id))])
      setCursor(data.nextCursor||null)
    }catch(err){setError(err.message||'Could not load more Vibes.')}
    finally{setPaging(false)}
  }
  const change=(id,patch)=>setPosts(current=>current.map(p=>p.id===id?{...p,...patch}:p))
  return <main className="mx-auto max-w-[660px] space-y-4 pb-10">
    <CompactPageHeader title="Hits & Vibes" searchValue={search} onSearchChange={setSearch}
      searchPlaceholder="Search Vibes…" searchLabel="Search Vibes posts and people"/>
    <form onSubmit={publish} aria-label="Create a Vibe" className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
      <div className="flex gap-3">
        <Avatar user={user}/>
        <div className="min-w-0 flex-1">
          <label htmlFor="vibe-text" className="sr-only">Say something…</label>
          <textarea id="vibe-text" value={text} onChange={e=>setText(e.target.value)}
            rows={2} placeholder="Say something…"
            className="w-full min-h-0 resize-y rounded-xl border-0 bg-[#F7F3EB] px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-[#0A13E6]"/>
          <div className="mt-1 text-right text-[10px] text-black/40">Up to 10,000 characters</div>
        </div>
      </div>
      {photos.length>0&&<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {photos.map(item=><div key={item.id} className="relative">
          {item.file.type.startsWith('video/')?<video src={item.preview} muted playsInline controls preload="metadata" className="aspect-square w-full rounded-xl bg-black object-contain"/>:<img src={item.preview} alt="Photo ready to post" className="aspect-square w-full rounded-xl object-cover" />}
          <button type="button" title="Remove photo" aria-label="Remove photo"
            disabled={publishing} onClick={()=>{
              URL.revokeObjectURL(item.preview)
              setPhotos(current=>current.filter(photo=>photo.id!==item.id))
            }} className="absolute top-1 right-1 grid h-8 w-8 place-items-center rounded-full bg-black/80 text-white">
            <X size={16}/></button>
        </div>)}
      </div>}
      {photos.length>0&&<p className="mt-2 text-[10px] leading-relaxed text-black/45">Without Google Vision, verified uploads publish automatically unless Cloudinary flags them. Once Vision is configured, uncertain media goes to review.</p>}
      {postError&&<p role="alert" className="mt-2 text-[12px] text-red-700">{postError}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-black/10 pt-3">
        <div>
          <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
            aria-label="Choose Vibes photos" className="hidden" onChange={choosePhotos}/>
          <button type="button" disabled={publishing||photos.length>=MAX_PHOTOS}
            onClick={()=>fileRef.current?.click()}
            className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[12px] font-bold text-[#0A13E6] hover:bg-blue-50 disabled:opacity-40">
            <ImagePlus size={19}/> Photo / video <span className="text-black/40">({photos.length}/{MAX_PHOTOS})</span>
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
