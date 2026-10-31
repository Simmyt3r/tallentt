import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, FileText, MessageCircle, ShieldAlert, WalletCards } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import BookingProgress from '../components/BookingProgress.jsx'
import DealQrCheckpoint from '../components/DealQrCheckpoint.jsx'
import EscrowFundingCard from '../components/EscrowFundingCard.jsx'
import UserIdentity from '../components/UserIdentity.jsx'
import WorkPassEvidence from '../components/WorkPassEvidence.jsx'

function money(value, currency = 'NGN') {
  if (value == null) return '—'
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(Number(value))
  } catch {
    return `₦${Number(value).toLocaleString()}`
  }
}

function nice(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function DealDetails() {
  const { dealId } = useParams()
  const [params] = useSearchParams()
  const { user, refreshUser } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [detailSection,setDetailSection]=useState('overview')
  const [cancellationReason,setCancellationReason]=useState('')
  const requestSequence = useRef(0)

  const load = useCallback(async ({ quiet = false } = {}) => {
    const sequence = ++requestSequence.current
    if (!quiet) setLoading(true)
    try {
      const next = await api.getDealDetail(dealId)
      if (sequence !== requestSequence.current) return
      setData(next)
      setError('')
    } catch (err) {
      if (sequence === requestSequence.current) {
        setError(err.message || 'Could not load this deal.')
      }
    } finally {
      if (!quiet && sequence === requestSequence.current) setLoading(false)
    }
  }, [dealId])

  useEffect(() => {
    void load()
    return () => { ++requestSequence.current }
  }, [load])

  async function run(operation) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      // Only paint a new payment/work state after the authoritative API succeeds.
      const result = await operation()
      if (result?.escrow) {
        ++requestSequence.current // Ignore an earlier in-flight detail response.
        setData((current) => current?.thread && String(current.thread.id) === String(result.escrow.id)
          ? { ...current, thread: { ...current.thread, ...result.escrow } }
          : current)
      }
      window.dispatchEvent(new CustomEvent('mydeals:changed'))
      // Wallet and timeline reconciliation are independent of action feedback.
      void refreshUser()
      void load({ quiet: true })
      return result
    } catch (err) {
      setError(err.message || 'Could not update this deal.')
      throw err
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <>
        <h1 className="mb-4 text-[22px] font-black">Deals details</h1>
        <div className="mx-auto max-w-4xl">
          <div className="h-72 animate-pulse rounded-[22px] border border-black/10 bg-white" />
        </div>
      </>
    )
  }

  if (!data?.thread) {
    return (
      <>
        <CompactPageHeader title="Deal Details"/>
        <div className="mx-auto max-w-4xl">
          <div className="rounded-[20px] border border-red-200 bg-red-50 p-5">
            <p className="text-[13px] font-bold text-red-700">{error || 'Deal not found.'}</p>
            <Link to="/deals" className="mt-3 inline-flex h-9 items-center rounded-full border border-red-300 bg-white px-4 text-[11px] font-black text-red-700">Back to My Deals</Link>
          </div>
        </div>
      </>
    )
  }

  const thread = data.thread
  const role = params.get('role') === 'talent' || params.get('role') === 'client'
    ? params.get('role')
    : thread.is_client ? 'client' : 'talent'
  const closed = ['released', 'refunded', 'cancelled'].includes(thread.status)
  const backTab = closed ? 'history' : thread.contacts_unlocked ? 'active' : thread.is_client ? 'outgoing' : 'incoming'
  const backUrl = `/deals?role=${role}&tab=${backTab}`
  const released = Number(thread.start_released_amount || 0)
  const remaining = Math.max(0, Number(thread.amount || 0) - released)
  const fundingBlocked = Boolean(thread.pending_offer) ||
    ((thread.price_type === 'range' || thread.price_negotiable) && !thread.agreed_at)

  return (
    <div className="mx-auto max-w-4xl pb-8">
      <h1 className="mb-3 text-[22px] font-black">Deals details</h1>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to={backUrl} className="inline-flex h-10 items-center gap-2 rounded-full border-[1.5px] border-black bg-white px-4 text-[11px] font-black">
          <ArrowLeft size={15} /> My Deals
        </Link>
      </div>
      <nav aria-label="Deal transaction sections" className="mb-3 flex flex-nowrap items-center gap-2 overflow-x-auto pb-2 whitespace-nowrap">
        {[['overview','Overview'],['agreement','Agreement'],['history','Chat & negotiation history'],['cancel','Cancel deal']].map(([id,label])=><button
          key={id} type="button" aria-current={detailSection===id?'page':undefined}
          onClick={()=>setDetailSection(id)}
          className={`min-h-11 shrink-0 rounded-full px-4 text-[12px] font-bold ${detailSection===id?'bg-[#0A13E6] text-white':'bg-white text-black/65 hover:bg-black/5'}`}>
          {label}
        </button>)}
      </nav>
      {detailSection==='agreement'&&<section aria-label="Deal agreement" className="space-y-3 border-b border-black/10 bg-white p-5">
        <h2 className="text-[17px] font-black">Agreement</h2>
        <p className="text-[12px] text-black/60">View the platform-generated record for this transaction. Funded agreements carry a verifiable reference for printing or entry checks; draft records are not gate passes.</p>
        <Link to={`/deals/${thread.id}/agreement`}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0A13E6] px-4 text-[12px] font-bold text-white">
          <FileText size={17}/> Open agreement
        </Link>
      </section>}
      {detailSection==='history'&&<section aria-label="Deal-specific conversation history" className="space-y-3 bg-white p-5">
        <h2 className="text-[17px] font-black">Chat &amp; negotiation history</h2>
        <p className="text-[11px] text-black/55">Showing messages and price proposals for this transaction only.</p>
        <ol className="divide-y divide-black/10">
          {(data.messages||[]).map(message=><li key={message.id} className="space-y-1 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="font-bold">{message.sender_id===user?.id?'You':thread.peer?.full_name||thread.peer?.username||'Other party'} · {message.kind==='offer'?'Price proposal':'Chat message'}</span>
              <time className="text-black/45">{new Date(message.created_at).toLocaleString()}</time>
            </div>
            <p className="whitespace-pre-wrap break-words text-[12px]">{message.body||'—'}</p>
            {message.kind==='offer'&&<p className="text-[11px] font-semibold text-[#0A13E6]">{money(message.amount,message.currency||thread.currency)} · {nice(message.offer_status)}</p>}
          </li>)}
        </ol>
        {!(data.messages||[]).length&&<p className="text-[12px] text-black/55">No messages recorded for this transaction.</p>}
        {data.cancellation&&<p className="rounded-xl bg-amber-50 p-3 text-[12px] text-amber-900">Cancelled before funding: {data.cancellation.reason} · {new Date(data.cancellation.cancelled_at).toLocaleString()}</p>}
        {data.nextCursor&&<p className="text-[11px] text-black/55">Older messages are available in the dedicated deal conversation.</p>}
        <Link to={`/messages?escrow=${thread.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0A13E6] px-4 text-[12px] font-bold text-white">
          <MessageCircle size={16}/> Open deal chat
        </Link>
      </section>}
      {detailSection==='cancel'&&<section aria-label="Cancel this deal" className="space-y-3 bg-white p-5">
        <h2 className="text-[17px] font-black">Cancel deal</h2>
        {thread.status==='not_funded' && !thread.checkout_locked_at && !thread.card_checkout_started
          ? <form className="space-y-3" onSubmit={event=>{
              event.preventDefault()
              if(!window.confirm('Cancel this unfunded deal? Both parties will retain a permanent cancellation record.'))return
              void run(()=>api.cancelUnfundedDeal(thread.id,cancellationReason))
                .then(()=>setCancellationReason('')).catch(()=>{})
            }}>
              <p className="text-[12px] text-black/60">Either party can cancel before escrow funding. The other party is notified and the reason is retained with the deal history.</p>
              <label className="block text-[12px] font-bold">Cancellation reason
                <textarea required minLength={5} maxLength={500} rows={3} value={cancellationReason}
                  onChange={event=>setCancellationReason(event.target.value)}
                  className="mt-2 block w-full rounded-xl border border-black/15 p-3 text-[12px]" placeholder="Explain why this deal is being cancelled"/>
              </label>
              <button type="submit" disabled={busy||cancellationReason.trim().length<5}
                className="min-h-11 rounded-full border border-red-300 px-5 text-[12px] font-bold text-red-700 disabled:opacity-40">
                {busy?'Cancelling…':'Confirm cancellation'}
              </button>
            </form>
          : thread.status==='secured'&&thread.work_status!=='disputed'
            ? <form className="space-y-3" onSubmit={event=>{
                event.preventDefault()
                if(!window.confirm('Open a dispute for this funded deal? A review is needed before any escrow refund or release.'))return
                void run(()=>api.bookingAction(thread.id,'open_dispute',{
                  expected_version:thread.work_version,note:cancellationReason,client_token:crypto.randomUUID(),
                })).then(()=>setCancellationReason('')).catch(()=>{})
              }}>
                <p className="text-[12px] text-black/60">This deal is funded. It cannot be cancelled unilaterally. Describe the problem to request ChombuTar dispute review; only unreleased escrow can be considered for a refund.</p>
                <label className="block text-[12px] font-bold">Reason for requesting cancellation
                  <textarea required minLength={5} maxLength={2000} value={cancellationReason} rows={3}
                    onChange={event=>setCancellationReason(event.target.value)}
                    className="mt-2 block w-full rounded-xl border border-black/15 p-3 text-[12px]"/>
                </label>
                <button type="submit" disabled={busy||cancellationReason.trim().length<5}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-amber-300 px-5 text-[12px] font-bold text-amber-800 disabled:opacity-40">
                  <ShieldAlert size={16}/> Request cancellation / Open dispute
                </button>
              </form>
            : <p className="text-[12px] text-black/60">{thread.status==='secured'?'A dispute is already open. Await authorized review.':closed?'This deal is already closed and cannot be cancelled again.':'Payment or checkout is in progress. Check the payment state before requesting cancellation.'}</p>}
      </section>}

      {error&&detailSection!=='overview'&&<p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-[12px] font-bold text-red-700">{error}</p>}

      {detailSection==='overview'&&
      <section className="overflow-hidden rounded-[24px] border-[1.5px] border-black bg-[#F7F3EB]">
        <header className="border-b border-black/10 bg-white px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mt-1">
                <UserIdentity
                  user={{
                    fullName: thread.peer?.full_name,
                    username: thread.peer?.username,
                    avatarUrl: thread.peer?.avatar_url,
                    role: thread.peer?.role,
                    companySuffix: thread.peer?.company_suffix,
                  }}
                  layout="inline"
                />
              </div>
            </div>
            <span className="rounded-full bg-[#F5F3EF] px-3 py-1.5 text-[10.5px] font-black">{nice(thread.status)}</span>
          </div>
        </header>

        {error && (
          <div role="alert" className="m-4 rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-[12px] font-semibold text-red-700 sm:mx-6">
            {error}
          </div>
        )}

        <div className="grid gap-4 p-4 sm:p-6">
          <section className="grid gap-3 sm:grid-cols-3" aria-label="Deal overview">
            <div className="rounded-[16px] border border-black/10 bg-white p-4">
              <p className="text-[9px] font-black uppercase tracking-[0.1em] text-black/35">Agreed amount</p>
              <p className="mt-1 text-[17px] font-black">{money(thread.amount, thread.currency)}{thread.pay_unit ? ` /${thread.pay_unit}` : ''}</p>
            </div>
            <div className="rounded-[16px] border border-black/10 bg-white p-4">
              <p className="text-[9px] font-black uppercase tracking-[0.1em] text-black/35">Work status</p>
              <p className="mt-1 text-[14px] font-black">{nice(thread.work_status || thread.status)}</p>
            </div>
            <div className="rounded-[16px] border border-black/10 bg-white p-4">
              <p className="text-[9px] font-black uppercase tracking-[0.1em] text-black/35">Your side</p>
              <p className="mt-1 text-[14px] font-black">{thread.is_client ? 'Client' : 'Talent'}</p>
            </div>
          </section>

          {thread.status === 'secured' && (
            <section className="rounded-[18px] border border-black/10 bg-white p-4" aria-label="Escrow summary">
              <div className="flex items-center gap-2">
                <WalletCards size={17} />
                <h2 className="text-[14px] font-black">Escrow</h2>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-[12px] bg-[#F7F3EB] px-2 py-3">
                  <p className="text-[9px] font-black uppercase text-black/35">Total</p>
                  <p className="mt-1 text-[12px] font-black">{money(thread.amount, thread.currency)}</p>
                </div>
                <div className="rounded-[12px] bg-[#F7F3EB] px-2 py-3">
                  <p className="text-[9px] font-black uppercase text-black/35">Released</p>
                  <p className="mt-1 text-[12px] font-black">{money(released, thread.currency)}</p>
                </div>
                <div className="rounded-[12px] bg-[#F7F3EB] px-2 py-3">
                  <p className="text-[9px] font-black uppercase text-black/35">Held</p>
                  <p className="mt-1 text-[12px] font-black">{money(remaining, thread.currency)}</p>
                </div>
              </div>
              <details className="mt-3 border-t border-black/10 pt-3 text-[12px]">
                <summary className="cursor-pointer font-bold text-[#0A13E6]">How escrow works</summary>
                <p className="mt-2 text-black/65">The agreed amount is secured before work starts. A verified Start QR releases the initial 30% payment; the remaining escrow is released after delivery approval and the Completion QR. Disputes pause settlement so the authorized process can release or refund funds still held. Platform commission is recorded when the deal is sealed.</p>
              </details>
            </section>
          )}

          {thread.is_client && thread.contacts_unlocked && thread.status === 'not_funded' && (
            <EscrowFundingCard
              amount={thread.amount}
              currency={thread.currency}
              feeEnabled={thread.gig_fee_terms_available===true}
              walletBalance={user?.walletBalance || 0}
              busy={busy}
              returnTo={`/deals/${thread.id}?role=client`}
              blockedByNegotiation={fundingBlocked}
              negotiationUrl={`/negotiations?escrow=${thread.id}`}
              onFund={() => { void run(() => api.fundEscrowWithWallet(thread.id, thread.amount)).catch(() => {}) }}
            />
          )}

          {!thread.is_client && thread.contacts_unlocked && thread.status === 'not_funded' && (
            <div className="rounded-[16px] border border-amber-200 bg-amber-50 p-4">
              <p className="text-[11px] font-black text-amber-900">Waiting for client funding</p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-amber-900/70">The agreed amount has not entered escrow yet. Work should begin only after funding and the Start QR checkpoint.</p>
            </div>
          )}

          {thread.status === 'secured' && ['awaiting_start', 'awaiting_completion'].includes(thread.work_status) && (
            <DealQrCheckpoint
              booking={thread}
              role={thread.is_client ? 'client' : 'talent'}
              onComplete={(result) => run(() => Promise.resolve(result))}
            />
          )}

          {['secured', 'released', 'refunded', 'cancelled'].includes(thread.status) && (
            <BookingProgress
              thread={thread}
              events={data.events || []}
              eventsCursor={data.eventsCursor || null}
              busy={busy}
              run={run}
              showHistory
            />
          )}

          <WorkPassEvidence thread={thread} />

          {thread.contacts_unlocked && (thread.peer?.email || thread.peer?.phone) && (
            <section className="rounded-[16px] border border-black/10 bg-white p-4" aria-label="Unlocked contact">
              <p className="text-[9px] font-black uppercase tracking-[0.1em] text-black/35">Unlocked contact</p>
              {thread.peer?.email && <p className="mt-1 break-all text-[12px] font-semibold">{thread.peer.email}</p>}
              {thread.peer?.phone && <p className="mt-1 text-[12px] font-semibold">{thread.peer.phone}</p>}
            </section>
          )}
        </div>
      </section>}
    </div>
  )
}
