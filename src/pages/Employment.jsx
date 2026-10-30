import {useCallback,useEffect,useRef,useState} from 'react'
import {salaryTrackingQuote} from '../../shared/monetization.js'
import {Link} from 'react-router-dom'
import {ArrowLeft,Send} from 'lucide-react'
import {api} from '../lib/api.js'
import {useAuth} from '../context/AuthContext.jsx'

const button='rounded-xl bg-[#0A13E6] px-4 py-2 text-xs font-bold text-white disabled:opacity-50'
const secondary='rounded-xl border border-black/15 px-3 py-2 text-xs font-semibold disabled:opacity-50'
const money=n=>'NGN '+Number(n).toLocaleString()+'/month'
const defaultTerms={role:'',talent:'',start_on:'',salary:'',due_day:28,notice_days:14,work_mode:'On-site',location:'',description:''}
function Field({label,children}){return <label className="block space-y-1 text-xs font-semibold"><span>{label}</span>{children}</label>}
function Back({onBack,title}){return <header className="flex items-center gap-3 border-b border-black/10 p-4"><button type="button" onClick={onBack} aria-label="Back to conversations" className="rounded-full p-2 hover:bg-black/5"><ArrowLeft size={19}/></button><h2 className="min-w-0 truncate text-base font-bold">{title}</h2></header>}

function TermsFields({value,onChange,talents}){
  const change=(key,v)=>onChange({...value,[key]:v})
  return <div className="space-y-3">
    <Field label="Role"><input className="tw-input" required maxLength={120} value={value.role} onChange={e=>change('role',e.target.value)}/></Field>
    <Field label="Talent"><select className="tw-input" required value={value.talent} onChange={e=>change('talent',e.target.value)}><option value="">Choose a talent</option>{talents.map(t=><option key={t}>{t}</option>)}</select></Field>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Start date"><input className="tw-input" type="date" required value={value.start_on} onChange={e=>change('start_on',e.target.value)}/></Field>
      <Field label="Work mode"><select className="tw-input" value={value.work_mode} onChange={e=>change('work_mode',e.target.value)}>{['On-site','Remote','Hybrid'].map(t=><option key={t}>{t}</option>)}</select></Field>
    </div>
    <Field label="Monthly salary (NGN, private)"><input className="tw-input" type="number" min="1" max="2000000000" step="1" required value={value.salary} onChange={e=>change('salary',e.target.value)}/></Field>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Salary due day"><input className="tw-input" type="number" min="1" max="31" required value={value.due_day} onChange={e=>change('due_day',e.target.value)}/></Field>
      <Field label="Notice period (days)"><input className="tw-input" type="number" min="0" max="365" required value={value.notice_days} onChange={e=>change('notice_days',e.target.value)}/></Field>
    </div>
    <p className="text-xs text-black/50">Dates use Lagos time. A due day beyond the end of a month uses that month’s last day.</p>
    <Field label="Work location"><input className="tw-input" maxLength={200} value={value.location} onChange={e=>change('location',e.target.value)}/></Field>
    <Field label="Responsibilities"><textarea className="tw-input min-h-24" maxLength={2000} value={value.description} onChange={e=>change('description',e.target.value)}/></Field>
  </div>
}

// Keep an unsuccessful request's key so retrying after a lost response cannot
// create another agreement, notification, message or salary event.
function useCommand(){
  const pending=useRef(null)
  return async body=>{
    const signature=JSON.stringify(body)
    if(pending.current?.signature!==signature)pending.current={signature,key:crypto.randomUUID()}
    const result=await api.employmentAction({...body,command_id:pending.current.key})
    pending.current=null
    return result
  }
}

export function NewEmployment({username='',onBack,onOpen}){
  const {user}=useAuth(),command=useCommand()
  const [name,setName]=useState(username),[target,setTarget]=useState(null),[terms,setTerms]=useState(defaultTerms),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const generation=useRef(0)
  async function lookup(value){
    const version=++generation.current
    setBusy(true);setError('');setTarget(null)
    try{
      const profile=await api.getUserProfile(value.trim().replace(/^[@^]/,''))
      if(version!==generation.current)return
      if(profile.user.id===user.id||profile.user.role==='client'||!profile.hats?.talent?.length)throw Error('Choose another person with an active Talent Card.')
      setTarget(profile);setTerms({...defaultTerms,talent:profile.hats.talent[0].category})
    }catch(e){if(version===generation.current)setError(e.message)}finally{if(version===generation.current)setBusy(false)}
  }
  useEffect(()=>{if(username)lookup(username);return()=>{generation.current++}},[username])
  async function create(e){
    e.preventDefault();setBusy(true);setError('')
    try{const result=await command({action:'employment_create',talent_id:target.user.id,terms});onOpen(result.agreement_id)}catch(e){setError(e.message)}finally{setBusy(false)}
  }
  return <section className="flex min-h-0 flex-col"><Back onBack={onBack} title="Hire full-time"/><div className="min-h-0 space-y-4 overflow-y-auto p-4">
    {!['client','dual'].includes(user?.role)?<p className="text-sm">A Client Card account is required to create employment agreements.</p>:<>
      <p className="text-sm text-black/60">Agree privately, then track monthly salary with Notify + Confirm. No upfront salary deposit is required.</p>
      <form onSubmit={e=>{e.preventDefault();lookup(name)}} className="flex items-end gap-2"><div className="min-w-0 flex-1"><Field label="Talent username"><input className="tw-input" value={name} required onChange={e=>{generation.current++;setName(e.target.value);setTarget(null);setBusy(false)}}/></Field></div><button className={secondary} disabled={busy}>Find talent</button></form>
      {target&&<form onSubmit={create}><fieldset disabled={busy} className="space-y-4">
        <p className="text-sm font-bold">Agreement with <Link className="text-blue-700 underline" to={'/profile/'+target.user.username}>{target.user.fullName||target.user.username}</Link></p>
        <TermsFields value={terms} onChange={setTerms} talents={[...new Set(target.hats.talent.map(h=>h.category))]}/>
        <p className="text-xs text-black/50">The draft is private to you until you send it. Both parties must accept the same terms.</p>
        <button className={button}>{busy?'Saving…':'Save draft'}</button>
      </fieldset></form>}
    </>}
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  </div></section>
}

function SalaryReport({period,agreement,today,onAction,busy}){
  const [month,setMonth]=useState(period?.month||today.slice(0,7)),[method,setMethod]=useState('bank_transfer'),[paidOn,setPaidOn]=useState(today),[escrow,setEscrow]=useState(''),[note,setNote]=useState('')
  const [consent,setConsent]=useState(false)
  const salary=Number(agreement.terms?.salary||0)
  const quote=salary>0?salaryTrackingQuote(salary,method):null
  return <form onSubmit={e=>{e.preventDefault();onAction('employment_report',{month,method,paid_on:paidOn,escrow_id:method==='escrow'?escrow:undefined,note,accept_tracking_fee:consent,expected_tracking_fee:quote?.trackingFee,...(period?{expected_revision:period.revision}:{})})}}>
    <fieldset disabled={busy} className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
      <legend className="px-1 text-sm font-bold">{period?'Correct payment report':'Notify salary paid'}</legend>
      <p className="text-xs text-black/60">Report only when the full agreed monthly salary has been paid. This records your report; it does not transfer money.</p>
      <div className="grid grid-cols-2 gap-3"><Field label="Salary month"><input className="tw-input" type="month" required value={month} min={agreement.terms.start_on.slice(0,7)} max={today.slice(0,7)} disabled={Boolean(period)} onChange={e=>setMonth(e.target.value)}/></Field>
        <Field label="Payment date"><input className="tw-input" type="date" required min={agreement.terms.start_on} max={today} value={paidOn} onChange={e=>setPaidOn(e.target.value)}/></Field></div>
      <Field label="Payment method"><select className="tw-input" value={method} onChange={e=>setMethod(e.target.value)}><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="escrow">Completed ChombuTar escrow</option></select></Field>
      {quote&&<div className="rounded-xl border border-[#0A13E6]/20 bg-white p-3 text-xs">
        <p className="font-black text-[#0A13E6]">Salary tracking fee: {money(quote.trackingFee)}</p>
        <p className="mt-1 text-black/60">{method==='bank_transfer'?'Flat ₦1,000 tracking fee':
          method==='cash'?'Flat ₦500 tracking fee':'2% of the monthly salary (in addition to any separate gig commission).'}</p>
        <p className="mt-1 text-black/60">The fee is debited from the employer’s ChombuTar wallet when the payment report is submitted. If the talent disputes full receipt, the tracking fee is refunded to the employer wallet.</p>
        <p className="mt-1 text-black/60">ChombuTar does not initiate or independently confirm bank transfers or cash payments.</p>
      </div>}
      <label className="flex items-start gap-2 text-[11px] font-semibold"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required className="mt-0.5"/> I agree to the salary tracking fee shown above.</label>
      {method==='escrow'&&<Field label="Completed escrow ID"><input className="tw-input" required value={escrow} onChange={e=>setEscrow(e.target.value)} placeholder="ID from the completed deal"/></Field>}
      <Field label="Payment note (optional, private)"><textarea className="tw-input" maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></Field>
      <button className={button}>Notify talent — salary paid</button>
    </fieldset>
  </form>
}

function SalaryPeriod({period,employer,agreement,today,onAction,busy}){
  const [mode,setMode]=useState(''),[note,setNote]=useState(''),[received,setReceived]=useState(today)
  const status={reported:'Awaiting talent confirmation',disputed:'Not received in full',confirmed:'Receipt confirmed'}[period.status]
  return <article className="space-y-3 rounded-2xl border border-black/10 p-4">
    <div className="flex flex-wrap justify-between gap-2"><h3 className="text-sm font-bold">{period.month}</h3><span className="text-xs font-semibold text-blue-700">{status}</span></div>
    <p className="text-xs text-black/60">Due {period.due_on} · Reported paid {period.paid_on} · {{bank_transfer:'Bank transfer',cash:'Cash',escrow:'ChombuTar escrow'}[period.method]}</p>
    {period.note&&<p className="whitespace-pre-wrap break-words text-xs">{period.note}</p>}
    {period.status==='confirmed'&&<p className="text-xs font-semibold text-green-700">Received {period.received_on} · {period.received_on<=period.due_on?'On time':'After due date'}</p>}
    {!employer&&period.status==='reported'&&<>
      <p className="text-xs text-black/60">Check that you received the full salary before confirming. Bank transfers and cash are confirmed by you, not verified by a bank connection.</p>
      <div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={()=>setMode('confirm')}>Review receipt</button><button className={secondary} disabled={busy} onClick={()=>setMode('dispute')}>Not received in full</button></div>
      {mode&&<form className="space-y-3" onSubmit={async e=>{e.preventDefault();if(await onAction(mode==='confirm'?'employment_confirm':'employment_dispute',{period_id:period.id,expected_revision:period.revision,...(mode==='confirm'?{received_on:received}:{note})}))setMode('')}}>
        <fieldset disabled={busy} className="space-y-3">{mode==='confirm'?<Field label="Date full salary was received"><input className="tw-input" required type="date" value={received} min={period.paid_on} max={today} onChange={e=>setReceived(e.target.value)}/></Field>:<Field label="What is missing?"><textarea className="tw-input" required maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></Field>}
          <button className={button}>{mode==='confirm'?'Yes, full salary received':'Submit non-receipt report'}</button><button type="button" className={secondary} onClick={()=>setMode('')}>Cancel</button>
        </fieldset>
      </form>}
    </>}
    {employer&&period.status==='disputed'&&<SalaryReport key={period.revision} period={period} agreement={agreement} today={today} onAction={onAction} busy={busy}/>}
  </article>
}

export function EmploymentThread({id,onBack,onChange}){
  const {user}=useAuth(),command=useCommand()
  const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[tab,setTab]=useState('agreement'),[editing,setEditing]=useState(false),[terms,setTerms]=useState(null),[publish,setPublish]=useState(false),[ending,setEnding]=useState(false),[endNote,setEndNote]=useState(''),[message,setMessage]=useState(''),[reply,setReply]=useState(null)
  const alive=useRef(true),sequence=useRef(0),scroll=useRef(null),bottom=useRef(true)
  const load=useCallback(async()=>{
    const seq=++sequence.current
    try{const next=await api.getEmployment(id);if(alive.current&&seq===sequence.current){setData(next);return next}}catch(e){if(alive.current&&seq===sequence.current)setError(e.message)}
  },[id])
  useEffect(()=>{
    alive.current=true;let stopped=false,timer
    const poll=async()=>{if(!document.hidden)await load();if(!stopped)timer=setTimeout(poll,8000)};poll()
    return()=>{alive.current=false;stopped=true;sequence.current++;clearTimeout(timer)}
  },[load])
  const read=useCallback(async()=>{
    if(tab!=='chat'||document.hidden||!bottom.current||!data?.messages?.some(m=>m.sender_id!==user.id&&!m.read_at))return
    const last=data.messages.at(-1)
    try{await api.employmentAction({action:'employment_read',agreement_id:id,through_id:last.id});window.dispatchEvent(new Event('inbox:read'))}catch{}
  },[data,tab,id,user.id])
  useEffect(()=>{if(tab==='chat'&&bottom.current)scroll.current?.scrollTo({top:scroll.current.scrollHeight});read()},[data,tab,read])
  useEffect(()=>{document.addEventListener('visibilitychange',read);return()=>document.removeEventListener('visibilitychange',read)},[read])
  async function action(name,extra={}){
    setBusy(true);setError('')
    try{await command({action:name,agreement_id:id,...extra});if(alive.current){await load();onChange?.();window.dispatchEvent(new Event('inbox:read'))}return true}
    catch(e){if(alive.current)setError(e.message);return false}finally{if(alive.current)setBusy(false)}
  }
  if(!data)return <section className="flex min-h-0 flex-col"><Back onBack={onBack} title="Employment"/><p role={error?'alert':undefined} className="p-5 text-sm">{error||'Loading agreement…'}</p>{error&&<button className={secondary} onClick={load}>Retry</button>}</section>
  const a=data.agreement,employer=a.employer_id===user.id,peer=employer?a.talent_name:a.employer_name,version={expected_version:a.version}
  const status={draft:'Private draft',pending:'Awaiting talent acceptance',active:a.terms.start_on>data.today?'Accepted · starts '+a.terms.start_on:'Active employment',declined:'Declined',withdrawn:'Withdrawn',ended:'Ended'}[a.status]
  async function send(e){e.preventDefault();if(await action('employment_message',{text:message,reply_to_id:reply?.id})){setMessage('');setReply(null);bottom.current=true;scroll.current?.scrollTo({top:scroll.current.scrollHeight})}}
  return <section className="flex min-h-0 flex-col"><Back onBack={onBack} title={peer||'Employment'}/>
    <div className="border-b border-black/10 px-4 py-3"><p className="text-sm font-bold">{a.terms.role}</p><p className="mt-1 text-xs text-blue-700">{status}</p></div>
    <div className="flex gap-2 px-4 py-2" role="group" aria-label="Employment sections">{[['agreement','Agreement'],['salary','Salary'],['chat','Chat']].map(([key,label])=><button key={key} className={tab===key?button:secondary} onClick={()=>{setTab(key);bottom.current=true}} aria-pressed={tab===key}>{label}</button>)}</div>
    {error&&<p role="alert" className="mx-4 rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    {tab==='agreement'&&<div className="min-h-0 space-y-4 overflow-y-auto p-4">
      <p className="text-xs text-black/55">Private between you and the other party. Review their <Link className="underline text-blue-700" to={'/profile/'+(employer?a.talent_username:a.employer_username)}>profile</Link> before accepting.</p>
      {editing?<form onSubmit={async e=>{e.preventDefault();if(await action('employment_revise',{...version,terms}))setEditing(false)}}><fieldset className="space-y-3" disabled={busy}><TermsFields value={terms} onChange={setTerms} talents={[a.terms.talent]}/><button className={button}>Save revised draft</button><button type="button" className={secondary} onClick={()=>setEditing(false)}>Cancel</button></fieldset></form>:<>
        <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-[#F7F5EF] p-4 text-xs">{[['Talent',a.terms.talent],['Salary (private)',money(a.terms.salary)],['Start date',a.terms.start_on],['Due day',a.terms.due_day+' each month'],['Notice period',a.terms.notice_days+' days'],['Work mode',a.terms.work_mode],['Location',a.terms.location||'Not specified'],['Terms version',a.version]].map(([label,value])=><div key={label}><dt className="text-black/50">{label}</dt><dd className="mt-1 break-words font-semibold">{value}</dd></div>)}</dl>
        {a.terms.description&&<p className="whitespace-pre-wrap break-words text-sm">{a.terms.description}</p>}
        {a.accepted_version&&<p className="text-xs text-green-700">Both parties accepted version {a.accepted_version}.</p>}
        <div className="flex flex-wrap gap-2">
          {employer&&['draft','pending'].includes(a.status)&&<button className={secondary} disabled={busy} onClick={()=>{setTerms(a.terms);setEditing(true)}}>Edit terms</button>}
          {employer&&a.status==='draft'&&<button className={button} disabled={busy} onClick={()=>action('employment_send',version)}>Accept terms & send invitation</button>}
          {employer&&['draft','pending'].includes(a.status)&&<button className={secondary} disabled={busy} onClick={()=>action('employment_withdraw',version)}>Withdraw agreement</button>}
        </div>
        {!employer&&a.status==='pending'&&<div className="space-y-3 rounded-xl bg-blue-50 p-4"><label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={publish} onChange={e=>setPublish(e.target.checked)}/>Show my employment status and confirmed salary-period count publicly. Salary amounts and employer details stay private.</label><div className="flex gap-2"><button className={button} disabled={busy} onClick={()=>action('employment_accept',{...version,publish_status:publish})}>Accept agreement</button><button className={secondary} disabled={busy} onClick={()=>action('employment_decline',version)}>Decline</button></div></div>}
        {!employer&&['active','ended'].includes(a.status)&&<label className="flex gap-2 text-xs"><input type="checkbox" checked={a.publish_status} disabled={busy} onChange={e=>action('employment_visibility',{publish_status:e.target.checked})}/>Show employment status and confirmed period count publicly (no amounts).</label>}
        {a.status==='active'&&<button className={secondary} disabled={busy} onClick={()=>setEnding(!ending)}>Record end of employment</button>}
        {ending&&<form className="space-y-3" onSubmit={async e=>{e.preventDefault();if(await action('employment_end',{...version,note:endNote}))setEnding(false)}}><p className="text-xs text-black/60">Records the end as today. Discuss the agreed notice period first. Outstanding salary confirmations remain available.</p><Field label="Reason for ending"><textarea required className="tw-input" maxLength={1000} value={endNote} onChange={e=>setEndNote(e.target.value)}/></Field><button className={button} disabled={busy}>Confirm employment ended</button></form>}
      </>}
      <details className="text-xs"><summary className="cursor-pointer font-semibold">Agreement & payment history</summary><ol className="mt-3 space-y-3">{data.events.map(event=><li key={event.id} className="rounded-lg border p-3"><p className="font-semibold">{event.action.replace('employment_','').replaceAll('_',' ')} · {new Date(event.created_at).toLocaleString()}</p>{event.metadata?.terms&&<p className="mt-1">Version {event.metadata.version} · {event.metadata.terms.role} · {money(event.metadata.terms.salary)} · Starts {event.metadata.terms.start_on}</p>}{event.metadata?.note&&<p className="mt-1 whitespace-pre-wrap break-words">{event.metadata.note}</p>}</li>)}</ol></details>
    </div>}
    {tab==='salary'&&<div className="min-h-0 space-y-4 overflow-y-auto p-4"><p className="text-xs text-black/55">A payment report is not proof of receipt. Only the named talent can confirm full payment. No salary amount appears on public cards.</p>
      {employer&&['active','ended'].includes(a.status)&&<SalaryReport agreement={a} today={data.today} onAction={action} busy={busy}/>}
      {!data.periods.length&&<p className="text-sm text-black/50">No salary reports yet.{!['active','ended'].includes(a.status)?' Both parties must accept the agreement first.':''}</p>}
      {data.periods.map(period=><SalaryPeriod key={period.id+':'+period.revision} period={period} employer={employer} agreement={a} today={data.today} onAction={action} busy={busy}/>)}</div>}
    {tab==='chat'&&<div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroll} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" onScroll={e=>{bottom.current=e.currentTarget.scrollHeight-e.currentTarget.scrollTop-e.currentTarget.clientHeight<60;if(bottom.current)read()}}>
        {data.messages.map(m=>m.kind==='event'?<p key={m.id} className="rounded-xl bg-black/5 p-3 text-center text-xs text-black/60">{m.body}</p>:<div key={m.id} className={'flex '+(m.sender_id===user.id?'justify-end':'justify-start')}><div className={'max-w-[85%] rounded-2xl p-3 text-sm '+(m.sender_id===user.id?'bg-[#0A13E6] text-white':'bg-[#F4F5F7]')}>
          {m.reply_body&&<blockquote className="mb-2 border-l-2 pl-2 text-xs opacity-70">{m.reply_body}</blockquote>}<p className="whitespace-pre-wrap break-words">{m.body}</p><div className="mt-2 flex gap-3 text-[10px] opacity-70"><time>{new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time>{m.sender_id===user.id&&<span>{m.read_at?'Seen':'Sent'}</span>}<button type="button" aria-label={'Reply to '+m.body} onClick={()=>setReply(m)}>Reply</button></div>
        </div></div>)}
        {!data.messages.length&&<p className="text-sm text-black/40">Send the invitation to start a private conversation.</p>}
      </div>
      {['pending','active','ended'].includes(a.status)&&<form onSubmit={send} className="space-y-2 border-t p-3">{reply&&<div className="flex gap-2 rounded-lg bg-blue-50 p-2 text-xs"><span className="min-w-0 flex-1 truncate">Replying to: {reply.body}</span><button type="button" onClick={()=>setReply(null)}>Cancel reply</button></div>}<div className="flex gap-2"><textarea aria-label="Employment message" className="tw-input min-h-12 flex-1 resize-none" maxLength={2000} value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(message.trim()&&!busy)send(e)}}}/><button className={button} disabled={busy||!message.trim()} aria-label="Send employment message"><Send size={18}/></button></div></form>}
    </div>}
  </section>
}
