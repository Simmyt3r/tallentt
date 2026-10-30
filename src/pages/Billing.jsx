import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {BadgeCheck,BriefcaseBusiness,CheckCircle2,Coins,ShieldCheck} from 'lucide-react'
import {api} from '../lib/api.js'
import {useAuth} from '../context/AuthContext.jsx'
import CompactPageHeader from '../components/CompactPageHeader.jsx'

const money=n=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(n||0)
const initials=group=>group==='talent'?'Talent plans':'Client plans'
export default function Billing(){
  const {user}=useAuth()
  const [data,setData]=useState(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [name,setName]=useState('')
  const [registration,setRegistration]=useState('')
  async function load(){
    setError('')
    try{setData(await api.getBilling())}
    catch(err){setError(err.message||'Billing is not ready. Admin must apply the Monetization migration.')}
  }
  useEffect(()=>{load()},[])
  async function pay(action){
    if(busy)return
    setBusy(true);setError('');setNotice('')
    try{const result=await api.billingAction(action);setNotice(result.alreadyProcessed?'Already recorded.':'Payment recorded successfully.');await load()}
    catch(err){setError(err.message||'Could not complete this payment.')}finally{setBusy(false)}
  }
  async function subscribe(a,plan){
    if(!window.confirm('Confirm '+money(plan.amountNaira)+' for one month of '+plan.name+'? This is a manual, non-recurring wallet payment.'))return
    await pay({action:'billing_subscribe',audience:a,plan:plan.id,
      expected_amount:plan.amountNaira,request_id:crypto.randomUUID()})
  }
  async function verify(event){
    event.preventDefault()
    if(!window.confirm('Pay '+money(data.verificationPrice)+' from your wallet to request manual business verification? Rejected requests are refunded to your wallet.'))return
    await pay({action:'billing_verify_business',legal_name:name,registration_number:registration,request_id:crypto.randomUUID()})
  }
  const plans=(audience,options)=>{
    const current=data.subscriptions.find(s=>s.audience===audience)
    const eligible=audience==='talent'?['talent','dual'].includes(data.accountRole):['client','dual'].includes(data.accountRole)
    return <section aria-label={initials(audience)} className="space-y-3">
      <h2 className="text-[17px] font-black">{initials(audience)}</h2>
      <p className="text-xs text-black/55">Paid membership is separate from earned Bronze, Silver, Gold and Diamond Work Pass status. No plan promises verified jobs or guaranteed performance.</p>
      <div className="grid gap-3 sm:grid-cols-3">{options.map(plan=><article key={plan.id}
        className="flex flex-col rounded-2xl border border-black/15 bg-white p-4 shadow-sm">
        <h3 className="text-[14px] font-black">{plan.name}</h3>
        <p className="mt-3 text-[20px] font-black text-[#0A13E6]">{plan.amountNaira===null?'Not priced':money(plan.amountNaira)}
          {plan.amountNaira!==null&&<span className="text-[10px] font-medium text-black/45"> / month</span>}</p>
        <p className="mt-2 flex-1 text-[11px] text-black/55">{plan.id==='free'?'Included with your account.':
          !plan.available?'Admin has not activated purchases for this plan.':
            'Manual one-month purchase using wallet balance. No automatic renewal.'}</p>
        {current?.plan_code===plan.id?<p className="mt-4 text-[11px] font-black text-green-700">Active until {new Date(current.expires_at).toLocaleDateString('en-NG')}</p>:
        plan.id==='free'?<p className="mt-4 text-[11px] font-bold">Default plan</p>:
        <button type="button" disabled={busy||!eligible||!plan.available}
          onClick={()=>subscribe(audience,plan)}
          className="mt-4 min-h-10 rounded-full bg-[#0A13E6] px-3 text-xs font-bold text-white disabled:bg-black/15 disabled:text-black/50">
          {!eligible?'Not eligible':plan.available?'Pay from wallet':'Not available yet'}</button>}
      </article>)}</div>
    </section>
  }
  return <main className="mx-auto max-w-[980px] space-y-6 pb-10">
    <CompactPageHeader title="Membership & verification" icon={Coins}/>
    <p className="text-[12px] leading-relaxed text-black/60">All amounts are in Nigerian naira. Plan charges are not activated until Admin publishes an approved price. <Link to="/wallet" className="font-bold text-[#0A13E6] underline">Open wallet</Link></p>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-xs text-red-700">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-green-50 p-4 text-xs text-green-800">{notice}</p>}
    {!data&&!error&&<p role="status" className="text-xs">Loading billing…</p>}
    {data&&<>
      {plans('talent',data.talentPlans)}
      {plans('client',data.clientPlans)}
      <section className="space-y-4 rounded-2xl border border-[#0A13E6]/20 bg-white p-5">
        <div className="flex items-center gap-2"><ShieldCheck size={22} className="text-[#0A13E6]"/><h2 className="text-[17px] font-black">Business verification</h2></div>
        <p className="text-[12px] text-black/60">Fee: <strong>{money(data.verificationPrice)}</strong>. Submitting a request does not make an account verified. Admin checks your business registration before granting status. Rejected applications are refunded to the same ChombuTar wallet.</p>
        {data.isBusinessVerified?<p className="flex items-center gap-2 text-sm font-bold text-green-700"><BadgeCheck size={18}/> Your business is verified.</p>:
          data.verification?.status==='pending'?<p role="status" className="text-sm font-bold text-amber-800">Verification pending Admin review for {data.verification.legal_name}.</p>:
          <>
            {data.verification?.status==='rejected'&&<p className="text-xs text-red-700">Previous request rejected: {data.verification.review_note||'See Admin'}. Your fee has been returned to your wallet.</p>}
            <form onSubmit={verify} className="grid gap-3 sm:grid-cols-2">
              <label className="text-[12px] font-bold">CAC registered business name<input required maxLength={180}
                className="mt-1 block w-full rounded-xl border border-black/20 p-3 text-sm font-medium"
                value={name} onChange={e=>setName(e.target.value)}/></label>
              <label className="text-[12px] font-bold">CAC registration number<input required maxLength={64}
                className="mt-1 block w-full rounded-xl border border-black/20 p-3 text-sm font-medium"
                value={registration} onChange={e=>setRegistration(e.target.value)}/></label>
              <button type="submit" disabled={busy}
                className="min-h-11 rounded-xl bg-[#0A13E6] px-5 text-xs font-black text-white disabled:opacity-40 sm:col-span-2">
                {busy?'Processing…':'Request verification · '+money(data.verificationPrice)}
              </button>
            </form>
          </>}
      </section>
    </>}
  </main>
}
