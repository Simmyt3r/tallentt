import {useEffect,useState} from 'react'
import {BadgeCheck,RefreshCw} from 'lucide-react'
import {api} from '../lib/api.js'
const money=n=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(n||0)
export default function AdminBilling(){
  const [data,setData]=useState(null),[loading,setLoading]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [drafts,setDrafts]=useState({})
  async function load(){
    setLoading(true);setError('')
    try{const result=await api.getAdminBilling();setData(result);setDrafts(Object.fromEntries(result.prices.map(p=>[p.audience+':'+p.plan_code,{amount:String(p.monthly_naira||''),enabled:p.enabled}])))}
    catch(err){setError(err.message||'Could not load billing. Apply the Monetization migration first.')}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[])
  async function update(action){
    setBusy(action.action==='billing_plan_price'?action.audience+':'+action.plan:action.request_id)
    setNotice('');setError('')
    try{await api.adminBillingAction(action);setNotice('Updated successfully.');await load()}
    catch(err){setError(err.message||'Could not update billing.')}finally{setBusy('')}
  }
  async function review(r,decision){
    const note=prompt(decision==='approved'?
      'Approval note (optional). Confirm CAC registration independently before approving:':
      'Explain why the registration cannot be verified (rejection refunds ₦3,000):')
    if(note===null)return
    if(decision==='rejected'&&!note.trim()){setError('A rejection explanation is required.');return}
    if(!confirm('Confirm '+decision+' for '+r.legal_name+'?'))return
    await update({action:'billing_review_business',request_id:r.id,decision,note})
  }
  return <section className="space-y-5 p-4">
    <div className="flex items-center justify-between gap-3">
      <div><h2 className="text-[15px] font-black">Membership pricing & verification</h2>
        <p className="mt-1 text-[11px] text-black/55">Paid plans cannot be purchased until you set and enable their monthly NGN price. Work Pass levels remain earned, not purchased.</p></div>
      <button type="button" onClick={load} disabled={loading} className="flex min-h-10 items-center gap-2 rounded-full border px-3 text-xs font-bold"><RefreshCw size={14}/> Refresh</button>
    </div>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-green-50 p-3 text-xs text-green-800">{notice}</p>}
    {!data&&loading&&<p className="text-xs">Loading…</p>}
    {data&&<>
      <div className="grid gap-3 md:grid-cols-2">{data.prices.map(p=>{
        const key=p.audience+':'+p.plan_code,d=drafts[key]||{amount:'',enabled:false}
        return <form key={key} onSubmit={e=>{
          e.preventDefault()
          if(!confirm('Publish '+p.plan_code.replace(/_/g,' ')+' for '+money(Number(d.amount))+' per month?'))return
          update({action:'billing_plan_price',audience:p.audience,plan:p.plan_code,amount:Number(d.amount),enabled:d.enabled})
        }} className="space-y-3 rounded-2xl border border-black/15 bg-[#F7F3EB] p-4">
          <h3 className="text-[13px] font-black capitalize">{p.audience} · {p.plan_code.replace(/_/g,' ')}</h3>
          <label className="text-xs font-medium">Monthly price (₦)<input type="number" min="1" step="1" required
            className="mt-1 block w-full rounded-xl border border-black/15 bg-white p-2"
            value={d.amount} onChange={e=>setDrafts(old=>({...old,[key]:{...d,amount:e.target.value}}))}/></label>
          <label className="flex items-center gap-2 text-xs font-bold">
            <input type="checkbox" checked={d.enabled} onChange={e=>setDrafts(old=>({...old,[key]:{...d,enabled:e.target.checked}}))}/>
            Enable purchases
          </label>
          <button type="submit" disabled={!!busy} className="min-h-10 rounded-full bg-[#0A13E6] px-4 text-xs font-bold text-white disabled:opacity-40">Save price</button>
        </form>
      })}</div>
      <div className="space-y-3 border-t border-black/10 pt-4">
        <h3 className="flex items-center gap-2 text-[14px] font-black"><BadgeCheck size={17}/> Pending business verification ({data.requests.length})</h3>
        <p className="text-[11px] text-black/55">Review legal name and CAC registration independently. Approval grants the business-verified flag. Rejection automatically refunds the ₦3,000 wallet charge.</p>
        {!data.requests.length&&<p className="text-xs text-black/50">No pending applications.</p>}
        {data.requests.map(r=><article key={r.id} className="rounded-xl border border-black/10 bg-white p-4">
          <h4 className="text-[13px] font-black">{r.legal_name}</h4>
          <p className="mt-1 text-xs text-black/60">{r.username} · CAC: {r.registration_number}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={!!busy} onClick={()=>review(r,'approved')} className="min-h-10 rounded-full bg-[#0A13E6] px-4 text-xs font-bold text-white">Approve</button>
            <button type="button" disabled={!!busy} onClick={()=>review(r,'rejected')} className="min-h-10 rounded-full border border-red-300 px-4 text-xs font-bold text-red-700">Reject & refund</button>
          </div>
        </article>)}
      </div>
    </>}
  </section>
}
