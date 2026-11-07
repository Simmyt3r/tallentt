import {useEffect,useState,useCallback} from 'react'
import {Link,useLocation} from 'react-router-dom'
import {api} from '../lib/api.js'
import {useAuth} from '../context/AuthContext.jsx'
import CompactPageHeader from '../components/CompactPageHeader.jsx'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const VERBS=[
  {value:'Collab',label:'Collab · completed paid job'},
  {value:'Hire',label:'Hire · accepted employment with confirmed salary'},
  {value:'Sponsor',label:'Sponsor · settled wallet transfer'},
]
export default function MilestoneCenter(){
  const {user}=useAuth()
  const location=useLocation()
  const params=new URLSearchParams(location.search)
  const [verb,setVerb]=useState(VERBS.some(v=>v.value===params.get('verb'))?params.get('verb'):'Collab')
  const [source,setSource]=useState(params.get('source')||'')
  const [allowance,setAllowance]=useState(null)
  const [seals,setSeals]=useState([])
  const [cases,setCases]=useState([])
  const [appealNotes,setAppealNotes]=useState({})
  const [busy,setBusy]=useState('')
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const refresh=useCallback(async()=>{
    const responses=await Promise.allSettled([
      api.getHatAllowance(),api.getMilestoneSeals(),api.getDiscoveryCases(),
    ])
    setAllowance(responses[0].status==='fulfilled'?responses[0].value:null)
    setSeals(responses[1].status==='fulfilled'?responses[1].value.seals||[]:[])
    setCases(responses[2].status==='fulfilled'?responses[2].value.cases||[]:[])
    const failures=responses.filter(item=>item.status==='rejected')
    if(failures.length) setError(failures[0].reason?.message||'Milestones need a database upgrade.')
    else setError('')
    setLoading(false)
  },[])
  useEffect(()=>{void refresh()},[refresh])
  async function submit(action,payload){
    setBusy(action);setError('');setNotice('')
    try{
      const result=await api.milestoneSealAction({action,...payload})
      setNotice(result.status==='sealed'?'Both parties confirmed. Verified points were recorded once.':
        result.status==='pending'?'Seal created. The other participant must confirm.':'Pending Seal cancelled.')
      await refresh()
    }catch(e){setError(e.message||'Could not update this Seal.')}
    finally{setBusy('')}
  }
  async function appeal(item){
    setBusy('appeal:'+item.id);setError('');setNotice('')
    try{
      await api.discoveryAction('discovery_appeal',{session_id:item.id,explanation:appealNotes[item.id]||''})
      setNotice('Appeal sent to Admin for review.')
      await refresh()
    }catch(e){setError(e.message||'Could not submit appeal.')}
    finally{setBusy('')}
  }
  const canSign=item=>item.status==='pending' &&
    ((item.client_id===user?.id&&!item.client_signed_at)||
     (item.talent_id===user?.id&&!item.talent_signed_at))
  const canCancel=item=>item.status==='pending'&&item.created_by===user?.id
  return <div className="mx-auto max-w-4xl space-y-6 pb-10">
    <CompactPageHeader title="Verified Milestones"/>
    <p className="text-[13px] leading-relaxed text-black/65">
      Orbit points require recorded evidence. Discovery is based on an intentional Hat open, active time and a recorded action.
      Collab, Hire and Sponsor need both participants to confirm the same verified source. A Seal here records
      in-platform consent; it is not a substitute for a legal electronic signature.
    </p>
    {loading&&<p className="text-[12px] text-black/50">Loading milestone evidence…</p>}
    {error&&<p className="rounded-xl bg-red-50 p-3 text-[12px] text-red-700" role="alert">{error}</p>}
    {notice&&<p className="rounded-xl bg-blue-50 p-3 text-[12px] text-blue-800" role="status">{notice}</p>}

    {allowance&&<section className="space-y-3">
      <h2 className="text-[16px] font-bold">My Hat allowance</h2>
      <p className="text-[14px] font-semibold tabular-nums">
        {allowance.used} used / {allowance.total} available · {allowance.remaining} remaining
      </p>
      <div className="flex flex-wrap gap-2 text-[11px] text-black/70">
        {Object.entries(allowance.credits||{}).filter(([,value])=>value>0).map(([key,value])=>
          <span className="rounded-full bg-black/5 px-3 py-1.5" key={key}>{key}: +{value} slots</span>)}
      </div>
      <p className="text-[12px] text-black/55">
        Your pre-migration Hats are preserved. Each milestone contributes at most ten additional lifetime slots.
        Revoked or disputed rewards cannot generate new slots. <Link to="/my-hats" className="font-semibold text-[#0A13E6]">Manage my Hats</Link>
      </p>
    </section>}

    <section className="space-y-3">
      <h2 className="text-[16px] font-bold">Request a verified Seal</h2>
      <p className="text-[12px] text-black/60">Use the transaction or agreement ID visible in your Deal, Employment or Wallet history. Only named participants may confirm. No payment is taken by this screen.</p>
      <form onSubmit={e=>{e.preventDefault();if(UUID.test(source.trim()))void submit('seal_create',{verb,source_id:source.trim()});else setError('Enter a valid source record ID.')}}
        className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
        <label className="space-y-1 text-[12px] font-semibold">
          <span>Milestone</span>
          <select value={verb} onChange={e=>setVerb(e.target.value)} className="h-11 w-full rounded-xl border border-black/15 px-3">
            {VERBS.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-[12px] font-semibold">
          <span>Verified source ID</span>
          <input value={source} onChange={e=>setSource(e.target.value)} maxLength={36} placeholder="Transaction / agreement UUID" className="h-11 w-full rounded-xl border border-black/15 px-3"/>
        </label>
        <button type="submit" disabled={!!busy} className="h-11 rounded-full bg-[#0A13E6] px-5 text-[12px] font-bold text-white disabled:opacity-50">Request Seal</button>
      </form>
      {!seals.length?<p className="py-3 text-[12px] text-black/50">No Seal requests recorded yet.</p>:
        <div className="divide-y divide-black/10">
          {seals.map(item=><article key={item.id} className="py-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-[13px]">{item.verb} Seal</strong>
              <span className="text-[11px] font-semibold capitalize">{item.status}</span>
            </div>
            <p className="break-all text-[11px] text-black/55">Source: {item.source_id}</p>
            <p className="text-[12px] text-black/60">
              Client: {item.client_signed_at?'Confirmed':'Awaiting confirmation'} ·
              Talent: {item.talent_signed_at?'Confirmed':'Awaiting confirmation'}
            </p>
            <div className="flex gap-2">
              {canSign(item)&&<button disabled={!!busy} onClick={()=>submit('seal_sign',{seal_id:item.id})}
                className="min-h-10 rounded-full bg-[#0A13E6] px-4 text-[12px] font-semibold text-white disabled:opacity-50">Confirm this Seal</button>}
              {canCancel(item)&&<button disabled={!!busy} onClick={()=>submit('seal_cancel',{seal_id:item.id})}
                className="min-h-10 rounded-full px-4 text-[12px] font-semibold text-red-700 disabled:opacity-50">Cancel request</button>}
            </div>
          </article>)}
        </div>}
    </section>

    <section className="space-y-3">
      <h2 className="text-[16px] font-bold">Discovery review and appeals</h2>
      <p className="text-[12px] text-black/60">Suspected coordinated or newly created accounts are held rather than credited automatically. Either participant can appeal; Admin must provide a recorded reason.</p>
      {!cases.length?<p className="text-[12px] text-black/50">No held or rejected Discovery cases linked to your account.</p>:
        <div className="divide-y divide-black/10">
          {cases.map(item=><article key={item.id} className="py-3 space-y-2">
            <p className="text-[12px] font-semibold">@{item.viewer_username} → @{item.talent_username} · {item.state}</p>
            <p className="text-[12px] text-black/65">{item.fraud_reason||'Evidence under review'}</p>
            {item.appeal_status?<p className="text-[11px] text-black/50">Appeal: {item.appeal_status}</p>:
              <>
                <textarea rows={2} maxLength={1000} value={appealNotes[item.id]||''}
                  onChange={e=>setAppealNotes(old=>({...old,[item.id]:e.target.value}))}
                  placeholder="Explain why this qualified Discovery was genuine (20–1,000 characters)…"
                  aria-label="Discovery appeal explanation" className="w-full rounded-xl border border-black/15 p-3 text-[12px]"/>
                <button type="button" disabled={!!busy} onClick={()=>appeal(item)}
                  className="min-h-10 rounded-full border border-black/15 px-4 text-[12px] font-semibold disabled:opacity-50">Submit appeal</button>
              </>}
          </article>)}
        </div>}
    </section>
  </div>
}
