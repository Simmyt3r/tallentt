import {useCallback,useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {ChevronDown,CornerDownRight,Send} from 'lucide-react'
import EntryActions from './EntryActions.jsx'
import {api} from '../lib/api.js'
import {cldImage} from '../lib/cloudinary.js'

function Avatar({person,size=30}){
  const image=person.avatar_url||person.avatarUrl
  const name=person.full_name||person.fullName||person.username||'U'
  return <span className="relative grid shrink-0 place-items-center rounded-full bg-[#0A13E6] font-black text-white"
    style={{width:size,height:size,fontSize:size*.38}}>
    {image?<img src={cldImage(image,{w:size*2,h:size*2})} alt="" loading="lazy"
      className="h-full w-full rounded-full object-cover"/>:name.slice(0,1).toUpperCase()}
    {person.is_online&&<span aria-label="Online" className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-green-500"/>}
  </span>
}
const dateText=value=>{try{return new Date(value).toLocaleString([],{dateStyle:'medium',timeStyle:'short'})}catch{return ''}}

function CommentBubble({item,postId,me,onDeleted,onReply}){
  const [editing,setEditing]=useState(false),[draft,setDraft]=useState(item.body||'')
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const [body,setBody]=useState(item.body||''),[edited,setEdited]=useState(Boolean(item.edited_at))
  useEffect(()=>{setBody(item.body||'');setDraft(item.body||'');setEdited(Boolean(item.edited_at))},[item.body,item.edited_at])
  const deleted=item.deleted===true
  async function save(){
    if(!draft.trim()||busy)return
    setBusy(true);setError('')
    try{
      await api.vibeAction({action:'edit_reply',post_id:postId,comment_id:item.id,text:draft.trim()})
      setBody(draft.trim());setEdited(true);setEditing(false)
    }catch(err){setError(err.message||'Could not edit this comment.')}
    finally{setBusy(false)}
  }
  async function remove(){
    if(!window.confirm('Delete this comment? Replies will remain in the conversation.'))return
    setBusy(true);setError('')
    try{
      await api.vibeAction({action:'delete_reply',post_id:postId,comment_id:item.id})
      onDeleted?.(item)
    }catch(err){setError(err.message||'Could not delete this comment.')}
    finally{setBusy(false)}
  }
  return <div className="flex min-w-0 items-start gap-2" data-comment-id={item.id}>
    <Avatar person={item} size={item.parent_id?26:30}/>
    <div className="min-w-0 flex-1">
      <div className={`rounded-2xl px-3 py-2 ${item.parent_id?'bg-white ring-1 ring-[#DDE2FD]':'bg-[#F7F3EB]'}`}>
        {deleted?<p className="text-[12px] italic text-black/45">Comment removed</p>:<>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Link to={'/profile/'+encodeURIComponent(item.username)}
              className="max-w-full truncate text-[12px] font-black text-[#18234A] hover:underline">{item.full_name||item.username}</Link>
            <span className="text-[10px] text-black/45">^{String(item.username||'').replace(/^[@^]+/,'')}</span>
            <time dateTime={item.created_at} className="text-[10px] text-black/40">{dateText(item.created_at)}</time>
          </div>
          {editing?<div className="mt-2 space-y-2">
            <textarea autoFocus aria-label="Edit comment" rows={2} maxLength={10000} value={draft}
              onChange={event=>setDraft(event.target.value)} className="w-full resize-y rounded-xl border border-black/15 bg-white p-2 text-[12px]"/>
            <div className="flex gap-3"><button type="button" disabled={!draft.trim()||busy} onClick={save}
              className="rounded-full bg-[#0A13E6] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40">Save</button>
              <button type="button" onClick={()=>setEditing(false)} className="text-[11px]">Cancel</button></div>
          </div>:<p className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-relaxed">{body}
            {edited&&<span className="ml-1 text-[10px] text-black/40">(edited)</span>}</p>}
        </>}
      </div>
      {!deleted&&<div className="mt-1 flex flex-wrap items-center gap-3 pl-2 text-[11px] font-bold">
        {onReply&&<button type="button" onClick={()=>onReply(item)} className="text-[#0A13E6] hover:underline">Reply</button>}
        {me.id===item.author_id&&<EntryActions label="comment"
          onEdit={()=>{setEditing(true);setDraft(body)}} onDelete={remove}/>}
      </div>}
      {error&&<p role="alert" className="mt-1 text-[11px] text-red-700">{error}</p>}
    </div>
  </div>
}
function CommentThread({item,post,me,onCount,onRootRemoved,threaded}){
  const [children,setChildren]=useState([])
  const [cursor,setCursor]=useState(null)
  const [expanded,setExpanded]=useState(false)
  const [loading,setLoading]=useState(false)
  const [busy,setBusy]=useState(false)
  const [draft,setDraft]=useState(''),[replying,setReplying]=useState(false)
  const [error,setError]=useState('')
  const [childCount,setChildCount]=useState(Number(item.child_count||0))
  const [removed,setRemoved]=useState(item.deleted===true)
  useEffect(()=>{setChildCount(Number(item.child_count||0));setRemoved(item.deleted===true)},[item.id,item.child_count,item.deleted])
  async function load(before=null){
    setLoading(true);setError('')
    try{
      const result=await api.getVibeReplies(post.id,before,item.id)
      setChildren(current=>before
        ? [...current,...(result.comments||[]).filter(row=>!current.some(c=>c.id===row.id))]
        : result.comments||[])
      setCursor(result.nextCursor||null)
    }catch(err){setError(err.message||'Could not load the conversation.')}
    finally{setLoading(false)}
  }
  function view(){
    if(expanded){setExpanded(false);return}
    setExpanded(true)
    if(!children.length)load()
  }
  async function reply(event){
    event.preventDefault()
    if(!draft.trim()||busy)return
    setBusy(true);setError('')
    try{
      await api.vibeAction({action:'reply',post_id:post.id,parent_id:item.id,text:draft.trim()})
      setDraft('');setReplying(false);setExpanded(true)
      setChildCount(count=>count+1)
      onCount(1)
      await load()
    }catch(err){setError(err.message||'Could not post your reply.')}
    finally{setBusy(false)}
  }
  function removeChild(child){
    setChildren(current=>current.filter(row=>row.id!==child.id))
    setChildCount(count=>Math.max(0,count-1))
    onCount(-1)
  }
  return <div className="min-w-0" data-thread-id={item.id}>
    <CommentBubble item={{...item,deleted:removed}} postId={post.id} me={me}
      onDeleted={row=>{setRemoved(true);onCount(-1);if(childCount===0)onRootRemoved(row)}}
      onReply={threaded&&!removed?()=>setReplying(value=>!value):null}/>
    {threaded&&<div className="ml-5 border-l-2 border-[#CFD7FF] pl-3 sm:ml-7 sm:pl-4">
      {childCount>0&&<button type="button" aria-expanded={expanded} onClick={view}
        className="my-2 inline-flex min-h-8 items-center gap-1.5 text-[11px] font-black text-[#0A13E6] hover:underline">
        <CornerDownRight size={14}/>{expanded?'Hide replies':`View ${childCount} ${childCount===1?'reply':'replies'}`}
        <ChevronDown size={13} className={expanded?'rotate-180':''}/>
      </button>}
      {expanded&&<div aria-label="Thread replies" className="space-y-3 pb-2">
        {[...children].reverse().map(child=><CommentBubble key={child.id} item={child} postId={post.id}
          me={me} onDeleted={removeChild}
          onReply={()=>{setDraft('@'+child.username+' ');setReplying(true)}}/>)}
        {loading&&<p role="status" className="text-[11px] text-black/45">Loading thread…</p>}
        {cursor&&!loading&&<button type="button" onClick={()=>load(cursor)}
          className="min-h-9 rounded-full border border-black/15 px-3 text-[11px] font-semibold">Load older replies</button>}
      </div>}
      {replying&&!removed&&<form onSubmit={reply} className="my-2 flex items-start gap-2">
        <label className="sr-only" htmlFor={'vibe-child-'+item.id}>Reply to {item.full_name||item.username}</label>
        <textarea autoFocus id={'vibe-child-'+item.id} rows={2} maxLength={10000} value={draft}
          onChange={event=>setDraft(event.target.value)} placeholder={`Reply to ${item.full_name||item.username}…`}
          className="min-h-12 min-w-0 flex-1 resize-y rounded-xl border border-[#BBC4F4] bg-white p-3 text-[12px]"/>
        <button type="submit" disabled={busy||!draft.trim()} aria-label="Send threaded reply"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#0A13E6] text-white disabled:opacity-40"><Send size={16}/></button>
      </form>}
      {error&&<p role="alert" className="my-2 text-[11px] text-red-700">{error}</p>}
    </div>}
  </div>
}
export default function VibesComments({post,me,onDelta}){
  const [comments,setComments]=useState([])
  const [cursor,setCursor]=useState(null),[text,setText]=useState('')
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false)
  const [threaded,setThreaded]=useState(false),[error,setError]=useState('')
  const fetchPage=useCallback(async(before=null)=>{
    setLoading(true);setError('')
    try{
      const result=await api.getVibeReplies(post.id,before)
      setComments(current=>before
        ? [...current,...(result.comments||[]).filter(row=>!current.some(c=>c.id===row.id))]
        : result.comments||[])
      setCursor(result.nextCursor||null)
      setThreaded(result.threaded===true)
    }catch(err){setError(err.message||'Could not load comments.')}
    finally{setLoading(false)}
  },[post.id])
  useEffect(()=>{fetchPage()},[fetchPage])
  function countChange(delta){
    onDelta(post.id,{replies:Math.max(0,Number(post.replies||0)+delta)})
  }
  async function submit(event){
    event.preventDefault()
    if(!text.trim()||busy)return
    setBusy(true);setError('')
    try{
      await api.vibeAction({action:'reply',post_id:post.id,text:text.trim()})
      setText('')
      countChange(1)
      await fetchPage()
    }catch(err){setError(err.message||'Could not post your comment.')}
    finally{setBusy(false)}
  }
  return <section aria-label="Comments" className="mt-3 border-t border-black/10 pt-3">
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-[13px] font-black text-[#17214C]">Conversation</h3>
      <span className="text-[10px] font-semibold text-black/45">{post.replies||0} comments and replies</span>
    </div>
    {error&&<p role="alert" className="mb-2 text-[12px] text-red-700">{error}</p>}
    {loading&&!comments.length&&<p role="status" className="py-3 text-[12px] text-black/40">Loading comments…</p>}
    {!loading&&!comments.length&&<p className="py-3 text-[12px] text-black/40">Be the first to reply.</p>}
    <div className="space-y-4">
      {[...comments].reverse().map(item=><CommentThread key={item.id} item={item}
        post={post} me={me} threaded={threaded} onCount={countChange}
        onRootRemoved={deleted=>setComments(current=>current.filter(row=>row.id!==deleted.id))}/>)}
    </div>
    {cursor&&<button type="button" disabled={loading} onClick={()=>fetchPage(cursor)}
      className="mt-3 min-h-10 w-full rounded-xl border border-black/15 text-[12px] font-semibold">Load older comments</button>}
    <form onSubmit={submit} className="mt-4 flex items-start gap-2 border-t border-black/10 pt-3">
      <Avatar person={me} size={32}/>
      <div className="flex min-w-0 flex-1 gap-2">
        <label className="sr-only" htmlFor={'vibe-reply-'+post.id}>Write a reply</label>
        <textarea rows={2} maxLength={10000} id={'vibe-reply-'+post.id} value={text}
          onChange={event=>setText(event.target.value)} placeholder="Join the conversation…"
          className="min-h-12 min-w-0 flex-1 resize-y rounded-xl border border-black/15 bg-[#F7F3EB] px-3 py-2 text-[12px] outline-none focus:border-[#0A13E6]"/>
        <button type="submit" disabled={busy||!text.trim()} aria-label="Send reply"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#0A13E6] text-white disabled:opacity-40"><Send size={17}/></button>
      </div>
    </form>
  </section>
}
