import {useRef,useState} from 'react'
import {ArrowLeftRight,CheckCircle2,X} from 'lucide-react'
import {api} from '../lib/api.js'
import UserIdentity from './UserIdentity.jsx'

// The idempotency token persists across ambiguous network retries. Editing
// transfer details rotates the token so an old request cannot be repurposed.
export default function WalletTransferDialog({balance=0,onClose,onComplete}){
  const [username,setUsername]=useState('')
  const [amount,setAmount]=useState('')
  const [recipient,setRecipient]=useState(null)
  const [checking,setChecking]=useState(false)
  const [sending,setSending]=useState(false)
  const [error,setError]=useState('')
  const token=useRef(crypto.randomUUID())
  const inFlight=useRef(false)
  const available=Number(balance)||0
  const validAmount=/^[1-9]\d*$/.test(amount)&&Number.isSafeInteger(Number(amount))
    &&Number(amount)<=2147483647&&Number(amount)<=available
  function editUsername(value){
    setUsername(value);setRecipient(null);setError('')
    token.current=crypto.randomUUID()
  }
  function editAmount(value){
    setAmount(value);setError('')
    token.current=crypto.randomUUID()
  }
  async function lookup(){
    if(!username.trim()||checking)return
    setError('');setRecipient(null);setChecking(true)
    try{
      const data=await api.findWalletRecipient(username.trim().replace(/^[@^]/,''))
      setRecipient(data.recipient)
    }catch(err){setError(err.message||'Could not verify this subscriber.')}
    finally{setChecking(false)}
  }
  async function send(event){
    event.preventDefault()
    if(inFlight.current||sending||!recipient||!validAmount)return
    if(!window.confirm(`Transfer ₦${Number(amount).toLocaleString()} to @${recipient.username} (${recipient.full_name})? This transfer cannot be undone.`))return
    inFlight.current=true;setSending(true);setError('')
    try{
      const result=await api.sendWalletTransfer(recipient.username,amount,token.current)
      await onComplete(result)
    }catch(err){
      setError(err.message||'Could not confirm this transfer. Retry with unchanged details; the request will not be charged twice.')
    }finally{inFlight.current=false;setSending(false)}
  }
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={()=>!sending&&onClose()}>
    <form onClick={e=>e.stopPropagation()} onSubmit={send}
      aria-label="Transfer to ChombuTar subscriber" className="w-full max-w-[420px] space-y-4 rounded-3xl bg-white p-5 shadow-2xl">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-black"><ArrowLeftRight size={19}/> Transfer to subscriber</h2>
        <button type="button" aria-label="Close wallet transfer" disabled={sending}
          onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full hover:bg-black/5 disabled:opacity-50"><X size={19}/></button>
      </div>
      <p className="text-xs text-black/65">Wallet-to-wallet transfers work only between registered ChombuTar accounts. They are immediate and cannot be reversed here.</p>
      <div className="space-y-2">
        <label htmlFor="transfer-username" className="block text-xs font-bold">Recipient username</label>
        <div className="flex gap-2">
          <input id="transfer-username" required autoComplete="off" maxLength={31} value={username}
            placeholder="@username" onChange={e=>editUsername(e.target.value)}
            className="h-11 min-w-0 flex-1 rounded-xl border border-black/20 px-3 text-sm"/>
          <button type="button" disabled={checking||!username.trim()} onClick={lookup}
            className="min-h-11 rounded-full border border-black/20 px-4 text-xs font-bold disabled:opacity-40">
            {checking?'Checking…':'Verify'}
          </button>
        </div>
        {recipient&&<div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs" role="status">
          <CheckCircle2 size={18} className="shrink-0 text-emerald-700"/>
          <UserIdentity user={recipient} layout="inline" showAvatar={false}/>
          <span className="text-emerald-700">Verified</span>
        </div>}
      </div>
      <div className="space-y-2">
        <label htmlFor="transfer-amount" className="block text-xs font-bold">Amount (₦)</label>
        <input id="transfer-amount" required type="number" inputMode="numeric" step="1" min="1" max="2147483647"
          value={amount} onChange={e=>editAmount(e.target.value)} placeholder="5000"
          className="h-11 w-full rounded-xl border border-black/20 px-3 text-sm"/>
        {amount&&Number(amount)>available&&<p className="text-xs font-semibold text-red-700">Insufficient wallet balance.</p>}
      </div>
      {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</p>}
      <button type="submit" disabled={!recipient||!validAmount||sending||checking}
        className="min-h-11 w-full rounded-full bg-[#0A13E6] px-4 text-sm font-bold text-white disabled:opacity-40">
        {sending?'Transferring…':'Confirm wallet transfer'}
      </button>
    </form>
  </div>
}
