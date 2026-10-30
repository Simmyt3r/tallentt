import {useEffect,useState} from 'react'
import {api} from '../../lib/api.js'
export default function ReputationCard({username,subjectId,isOwner}){
 const [data,setData]=useState(null),[jobs,setJobs]=useState([]),[job,setJob]=useState(''),[stars,setStars]=useState(5),[body,setBody]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const load=async()=>{const profile=await api.getUserProfile(username);setData(profile.reputation);if(!isOwner){const result=await api.getReviewJobs(subjectId);setJobs(result.jobs||[])}}
 useEffect(()=>{let alive=true;api.getUserProfile(username).then(p=>{if(alive)setData(p.reputation)}).catch(()=>{});if(!isOwner)api.getReviewJobs(subjectId).then(r=>{if(alive)setJobs(r.jobs||[])}).catch(()=>{});return()=>{alive=false}},[username,subjectId,isOwner])
 if(!data)return null
 async function submit(e){e.preventDefault();setBusy(true);setError('');try{await api.reviewAction({action:'review_submit',escrow_id:job,stars,body});setBody('');setJob('');await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <section aria-label="Work reputation" className="space-y-4 rounded-2xl border border-black/10 bg-white p-4">
  <h2 className="text-sm font-bold">Lifetime work reputation</h2>
  <div className="grid grid-cols-2 gap-3">{[['talent','Talent Orbit'],['employer','Employer trust']].map(([key,label])=><div key={key} className="rounded-xl bg-blue-50 p-3"><p className="text-xs">{label}</p><p className="text-lg font-bold">{data[key].points} points · Lv {data[key].level}</p></div>)}</div>
  <p className="text-xs text-black/50">Earned from recorded work since this system launched. Separate from the activity score. Levels use the square root of points divided by 100, rounded down.</p>
  {data.talents.map(t=><p key={t.talent} className="text-xs font-semibold">{t.talent}: {t.points} points · Level {t.level}</p>)}
  {data.reliability.confirmed>0&&<p className="text-xs">Salary received on time: {data.reliability.on_time}/{data.reliability.confirmed} confirmed periods shared publicly by talents. Unconfirmed periods are excluded.</p>}
  <h3 className="text-sm font-bold">Completed-work reviews</h3>
  {data.ratings.map(r=><p key={r.lane} className="text-xs">{r.lane==='talent'?'As a talent':'As an employer'}: {r.rating.toFixed(1)}/5 from {r.count} reviews</p>)}
  {!data.reviews.length&&<p className="text-xs text-black/50">No completed-work reviews yet.</p>}
  {data.reviews.map(r=><article key={r.id} className="rounded-xl border p-3 text-xs"><p className="font-semibold">{r.stars}/5 · {r.talent} · @{r.reviewer_username}</p><p className="mt-2 whitespace-pre-wrap break-words">{r.body}</p></article>)}
  {jobs.length>0&&<form onSubmit={submit}><fieldset disabled={busy} className="space-y-3"><legend className="text-xs font-bold">Review your completed work together</legend><select aria-label="Completed job to review" className="tw-input" required value={job} onChange={e=>setJob(e.target.value)}><option value="">Choose a completed job</option>{jobs.map(j=><option key={j.id} value={j.id}>{j.hat_title||'Completed job'} · {j.id.slice(0,8)}</option>)}</select><select aria-label="Review stars" className="tw-input" value={stars} onChange={e=>setStars(Number(e.target.value))}>{[5,4,3,2,1].map(n=><option key={n} value={n}>{n} stars</option>)}</select><textarea aria-label="Public work review" required className="tw-input" maxLength={1000} value={body} onChange={e=>setBody(e.target.value)} placeholder="Describe the work. Keep pay and contact details private."/><p className="text-xs text-black/50">Your review is public and can be submitted once per completed job.</p><button className="tw-btn-primary" type="submit">Publish review</button></fieldset></form>}
  {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
 </section>
}
