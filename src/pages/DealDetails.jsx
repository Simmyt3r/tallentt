import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Handshake, MessageCircle, WalletCards } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import BookingProgress from '../components/BookingProgress.jsx'
import DealQrCheckpoint from '../components/DealQrCheckpoint.jsx'
import EscrowFundingCard from '../components/EscrowFundingCard.jsx'
import UserIdentity from '../components/UserIdentity.jsx'

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

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    try {
      const next = await api.getDealDetail(dealId)
      setData(next)
      setError('')
    } catch (err) {
      setError(err.message || 'Could not load this deal.')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [dealId])

  useEffect(() => {
    load()
  }, [load])

  async function run(operation) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await operation()
      await refreshUser()
      await load({ quiet: true })
      window.dispatchEvent(new CustomEvent('mydeals:changed'))
    } catch (err) {
      setError(err.message || 'Could not update this deal.')
      throw err
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="h-72 animate-pulse rounded-[22px] border border-black/10 bg-white" />
      </div>
    )
  }

  if (!data?.thread) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="rounded-[20px] border border-red-200 bg-red-50 p-5">
          <p className="text-[13px] font-bold text-red-700">{error || 'Deal not found.'}</p>
          <Link to="/deals" className="mt-3 inline-flex h-9 items-center rounded-full border border-red-300 bg-white px-4 text-[11px] font-black text-red-700">Back to My Deals</Link>
        </div>
      </div>
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to={backUrl} className="inline-flex h-10 items-center gap-2 rounded-full border-[1.5px] border-black bg-white px-4 text-[11px] font-black">
          <ArrowLeft size={15} /> My Deals
        </Link>
        <div className="flex flex-wrap gap-2">
          {(thread.price_type === 'range' || thread.price_negotiable) && (
            <Link to={`/negotiations?escrow=${thread.id}`} className="inline-flex h-10 items-center gap-2 rounded-full border-[1.5px] border-black bg-white px-4 text-[11px] font-black">
              <Handshake size={15} /> Negotiation
            </Link>
          )}
          <Link to={`/messages?escrow=${thread.id}`} className="inline-flex h-10 items-center gap-2 rounded-full bg-black px-4 text-[11px] font-black text-white">
            <MessageCircle size={15} /> Deals Chat
          </Link>
        </div>
      </div>

      <section className="overflow-hidden rounded-[24px] border-[1.5px] border-black bg-[#F7F3EB]">
        <header className="border-b border-black/10 bg-white px-4 py-5 sm:px-6">
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-black/35">Deal workspace</p>
          <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[22px] font-black tracking-tight">{thread.hat_title}</h1>
              <div className="mt-2">
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
            </section>
          )}

          {thread.is_client && thread.contacts_unlocked && thread.status === 'not_funded' && (
            <EscrowFundingCard
              amount={thread.amount}
              currency={thread.currency}
              walletBalance={user?.walletBalance || 0}
              busy={busy}
              returnTo={`/deals/${thread.id}?role=client`}
              blockedByNegotiation={fundingBlocked}
              negotiationUrl={`/negotiations?escrow=${thread.id}`}
              onFund={() => run(() => api.fundEscrowWithWallet(thread.id, thread.amount))}
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
              onComplete={() => run(async () => {})}
            />
          )}

          {['secured', 'released', 'refunded', 'cancelled'].includes(thread.status) && (
            <BookingProgress
              thread={thread}
              events={data.events || []}
              eventsCursor={data.eventsCursor || null}
              busy={busy}
              run={run}
              refreshUser={refreshUser}
              showHistory
            />
          )}

          {thread.contacts_unlocked && (thread.peer?.email || thread.peer?.phone) && (
            <section className="rounded-[16px] border border-black/10 bg-white p-4" aria-label="Unlocked contact">
              <p className="text-[9px] font-black uppercase tracking-[0.1em] text-black/35">Unlocked contact</p>
              {thread.peer?.email && <p className="mt-1 break-all text-[12px] font-semibold">{thread.peer.email}</p>}
              {thread.peer?.phone && <p className="mt-1 text-[12px] font-semibold">{thread.peer.phone}</p>}
            </section>
          )}
        </div>
      </section>
    </div>
  )
}
