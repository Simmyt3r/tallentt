import {useEffect,useState} from 'react'
import {api} from '../lib/api.js'
export default function AdminVibesVideoReview(){
 const [posts,setPosts]=useState([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [busy,setBusy]=useState('')
 const load=async()=>{
   setLoading(true)
   try{const result=await api.getAdminVibesVideos();setPosts(result.posts||[]);setError('')}
   catch(e){setError(e.message||'Unable to load media review queue.')}
   finally{setLoading(false)}
 }
 useEffect(()=>{load()},[])
 async function decide(id,decision){
   if(busy)return
   if(!window.confirm(`${decision==='approve'?'Publish':'Reject'} this media post?`))return
   setBusy(id);setError('')
   try{await api.moderateVibesVideo(id,decision);setPosts(rows=>rows.filter(row=>row.id!==id))}
   catch(e){setError(e.message||'Review failed.')}
   finally{setBusy('')}
 }
 return <section className="space-y-4" aria-label="Vibes media awaiting review">
   <header className="space-y-1 rounded-xl border border-black/10 bg-white p-4">
     <h2 className="text-[16px] font-black">Hits & Vibes media moderation</h2>
     <p className="text-[12px] text-black/60">Uploaded videos and unscreened photos stay hidden from the public until manually approved. Review content before publishing; do not approve on appearance alone if it violates policy.</p>
     <button type="button" onClick={load} className="min-h-10 rounded-full border border-black/20 px-4 text-[12px] font-bold">Refresh review queue</button>
   </header>
   {error&&<p role="alert" className="text-[12px] text-red-700">{error}</p>}
   {loading&&<p role="status">Loading media…</p>}
   {!loading&&!posts.length&&<p className="rounded-xl border border-black/10 bg-white p-4 text-[12px]">No media awaiting review.</p>}
   {posts.map(post=><article key={post.id} className="space-y-3 rounded-xl border border-black/10 bg-white p-4">
     <p className="text-[12px] font-bold">{post.full_name||post.username} · {post.username}</p>
     {post.body&&<p className="whitespace-pre-line text-[12px]">{post.body}</p>}
     {(post.media||[]).map((media,i)=>media.type==='video'
       ? <video key={media.public_id||i} src={media.url} controls preload="metadata" className="w-full max-h-[390px] rounded-xl bg-black" aria-label="Video awaiting review"/>
       : <img key={media.public_id||i} src={media.url} alt="Photo awaiting review" className="w-full max-h-[390px] rounded-xl object-contain"/> )}
     <div className="flex gap-3">
       <button type="button" disabled={Boolean(busy)} onClick={()=>decide(post.id,'approve')}
         className="min-h-11 rounded-full bg-[#0A13E6] px-5 text-[12px] font-bold text-white">Approve</button>
       <button type="button" disabled={Boolean(busy)} onClick={()=>decide(post.id,'reject')}
         className="min-h-11 rounded-full border border-red-200 px-5 text-[12px] font-bold text-red-700">Reject</button>
     </div>
   </article>)}
 </section>
}