import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, LockKeyhole, RefreshCw, Send, UnlockKeyhole } from 'lucide-react'
import { api, payForBooking } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import BookingProgress, { workLabels } from '../components/BookingProgress.jsx'
import DealQrCheckpoint from '../components/DealQrCheckpoint.jsx'
import UserIdentity from '../components/UserIdentity.jsx'
import { getPrimaryIdentity, identityFromRow } from '../lib/profile.js'

const money = (amount, currency = 'NGN') =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: currency || 'NGN',
    maximumFractionDigits: 0,
  }).format(Number(amount || 0))

const statusLabel = {
  not_funded: 'Awaiting payment',
  secured: 'Payment secured',
  released: 'Payment released',
  cancelled: 'Cancelled',
  refunded: 'Refunded to wallet',
}

const offerStatusLabel = {
  pending: 'Awaiting response',
  accepted: 'Accepted',
  declined: 'Rejected',
  withdrawn: 'Withdrawn',
  superseded: 'Countered',
}

const button =
  'px-3 py-2 rounded-full border-[1.5px] border-black/20 text-xs font-semibold disabled:opacity-40 hover:bg-black/5 transition'

function formatRange(thread) {
  if (thread.price_type !== 'range') return null
  const min = Number(thread.price_min)
  const max = Number(thread.price_max)
  if (Number.isFinite(min) && Number.isFinite(max) && max > min) {
    return `${money(min, thread.currency)} – ${money(max, thread.currency)}`
  }
  if (Number.isFinite(min) && min > 0) return money(min, thread.currency)
  return 'Flexible'
}

function ErrorNotice({ message, onRetry }) {
  return (
    <div
      role="alert"
      className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-[14px] p-3 flex flex-wrap items-center gap-2"
    >
      <span className="flex-1 min-w-0 break-words">{message}</span>
      {onRetry && (
        <button type="button" title="Refresh" aria-label="Refresh" onClick={onRetry} className="p-2">
          <RefreshCw size={15} />
        </button>
      )}
    </div>
  )
}

function NegotiationHistory({ offers, thread, userId }) {
  if (!offers.length) return null

  return (
    <details className="rounded-[15px] border border-black/10 bg-white overflow-hidden">
      <summary className="cursor-pointer list-none px-3.5 py-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-black/45">
            Negotiation history
          </p>
          <p className="mt-0.5 text-[12px] font-semibold text-black/60">
            {offers.length} {offers.length === 1 ? 'proposal' : 'proposals'}
          </p>
        </div>
        <span className="text-[11px] font-bold text-black/45">View</span>
      </summary>

      <div className="border-t border-black/10 p-3.5 space-y-3">
        {offers.map((offer, index) => {
          const own = offer.sender_id === userId
          return (
            <div key={offer.id} className="relative pl-4">
              <span className="absolute left-0 top-1.5 w-2 h-2 rounded-full bg-black" />
              {index < offers.length - 1 && (
                <span className="absolute left-[3px] top-3 bottom-[-14px] w-px bg-black/15" />
              )}
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[12px] font-black">
                  {own ? 'You' : thread.peer?.full_name || thread.peer?.username || 'Other party'} proposed{' '}
                  {money(offer.amount, offer.currency || thread.currency)}
                  {(offer.pay_unit || thread.pay_unit) ? ` /${offer.pay_unit || thread.pay_unit}` : ''}
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[9.5px] font-black ${
                    offer.offer_status === 'accepted'
                      ? 'bg-emerald-100 text-emerald-700'
                      : offer.offer_status === 'pending'
                        ? 'bg-[#0A13E6]/10 text-[#0A13E6]'
                        : 'bg-black/[0.06] text-black/50'
                  }`}
                >
                  {offerStatusLabel[offer.offer_status] || offer.offer_status}
                </span>
              </div>
              {offer.body && (
                <p className="mt-1 text-[11.5px] leading-relaxed text-black/55 whitespace-pre-wrap break-words">
                  {offer.body}
                </p>
              )}
              <time
                dateTime={offer.created_at}
                className="mt-1 block text-[10px] font-medium text-black/35"
              >
                {new Date(offer.created_at).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </div>
          )
        })}
      </div>
    </details>
  )
}

function NegotiationPanel({
  thread,
  offers,
  pending,
  userId,
  busy,
  offerMode,
  amount,
  note,
  error,
  onAmount,
  onNote,
  onOpenOffer,
  onCancelOffer,
  onSubmitOffer,
  onRespond,
}) {
  const range = formatRange(thread)
  const ownPending = pending?.sender_id === userId
  const hasAgreement = Boolean(thread.agreed_at)
  const negotiable =
    (thread.price_type === 'range' || thread.price_negotiable) &&
    thread.status === 'not_funded' &&
    !thread.checkout_locked_at &&
    !hasAgreement

  return (
    <section className="border-b border-black/10 bg-[#F7F3EB] p-4">
      <div className="rounded-[20px] border-[1.5px] border-black bg-white overflow-hidden">
        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#0A13E6]">
                Price negotiation
              </p>
              <h3 className="mt-1 text-[17px] font-black tracking-tight">
                {hasAgreement ? 'Agreement reached' : pending ? 'Current proposal' : 'Agree the final deal price'}
              </h3>
              <p className="mt-1 max-w-[560px] text-[12px] font-medium leading-relaxed text-black/50">
                {hasAgreement
                  ? 'This price is now locked for the deal.'
                  : 'Either side can propose an amount. The other side can accept, reject, or counter until one proposal is accepted.'}
              </p>
            </div>

            {range && (
              <div className="rounded-[12px] border border-black/10 bg-[#F7F3EB] px-3 py-2 text-right">
                <p className="text-[9px] font-black uppercase tracking-[0.12em] text-black/35">Listed range</p>
                <p className="mt-0.5 text-[12px] font-black">
                  {range}{thread.pay_unit ? ` /${thread.pay_unit}` : ''}
                </p>
              </div>
            )}
          </div>

          {hasAgreement ? (
            <div className="mt-4 rounded-[16px] border-[1.5px] border-emerald-700/25 bg-emerald-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">Final agreed price</p>
              <p className="mt-1 text-[22px] font-black text-emerald-800">
                {money(thread.amount, thread.currency)}
                {thread.pay_unit ? <span className="text-[12px] font-bold"> /{thread.pay_unit}</span> : null}
              </p>
              {!thread.contacts_unlocked && (
                <p className="mt-1 text-[11px] font-semibold text-emerald-700/80">
                  Return to My Deals to accept the request and move it into Active Deals.
                </p>
              )}
            </div>
          ) : pending ? (
            <div className="mt-4 rounded-[16px] border-[1.5px] border-black bg-[#FCFBF8] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-black/40">
                    {ownPending ? 'Your proposal' : 'Proposal received'}
                  </p>
                  <p className="mt-1 text-[22px] font-black">
                    {money(pending.amount, pending.currency || thread.currency)}
                    {(pending.pay_unit || thread.pay_unit) ? (
                      <span className="text-[12px] font-bold text-black/50">
                        {' '}/{pending.pay_unit || thread.pay_unit}
                      </span>
                    ) : null}
                  </p>
                  {pending.body && (
                    <p className="mt-2 max-w-[560px] text-[12px] leading-relaxed text-black/60 whitespace-pre-wrap">
                      {pending.body}
                    </p>
                  )}
                </div>
                <span className="rounded-full bg-[#0A13E6]/10 px-2.5 py-1 text-[10px] font-black text-[#0A13E6]">
                  Awaiting response
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {ownPending ? (
                  <>
                    <button
                      type="button"
                      className={button}
                      disabled={busy}
                      onClick={() => onRespond('withdrawn')}
                    >
                      Withdraw
                    </button>
                    <button
                      type="button"
                      className="px-4 py-2 rounded-full border-[1.5px] border-black bg-black text-white text-xs font-black disabled:opacity-40"
                      disabled={busy || !negotiable}
                      onClick={() => onOpenOffer(pending.id)}
                    >
                      Revise proposal
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="px-4 py-2 rounded-full border-[1.5px] border-black bg-[#0A13E6] text-white text-xs font-black disabled:opacity-40"
                      disabled={busy}
                      onClick={() => onRespond('accepted')}
                    >
                      Accept proposal
                    </button>
                    <button
                      type="button"
                      className={button}
                      disabled={busy}
                      onClick={() => onRespond('declined')}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className="px-4 py-2 rounded-full border-[1.5px] border-black bg-black text-white text-xs font-black disabled:opacity-40"
                      disabled={busy || !negotiable}
                      onClick={() => onOpenOffer(pending.id)}
                    >
                      Counter
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : negotiable ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[15px] border border-black/10 bg-[#FCFBF8] p-3.5">
              <div>
                <p className="text-[12px] font-black">{offers.length ? 'No proposal is currently active.' : 'No proposal has been sent yet.'}</p>
                <p className="mt-0.5 text-[11px] font-medium text-black/45">
                  {offers.length ? 'Send the next proposal to continue negotiating.' : 'Start with the amount you want the deal to use.'}
                </p>
              </div>
              <button
                type="button"
                className="h-9 px-4 rounded-full border-[1.5px] border-black bg-[#0A13E6] text-white text-[11px] font-black"
                onClick={() => onOpenOffer(null)}
              >
                {offers.length ? 'Make new proposal' : 'Make first proposal'}
              </button>
            </div>
          ) : null}

          {offerMode && negotiable && (
            <form onSubmit={onSubmitOffer} className="mt-4 rounded-[16px] border-[1.5px] border-black bg-[#F7F3EB] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0A13E6]">
                    {offers.length ? 'Counter proposal' : 'First proposal'}
                  </p>
                  <p className="mt-1 text-[13px] font-black">Set the price you want to propose</p>
                </div>
                <button type="button" onClick={onCancelOffer} className="text-[11px] font-bold underline text-black/50">
                  Cancel
                </button>
              </div>

              <div className="mt-3 grid sm:grid-cols-[180px_1fr] gap-3">
                <label className="block text-[11px] font-black">
                  Amount ({thread.currency || 'NGN'})
                  <input
                    type="number"
                    min={thread.price_min || 1}
                    max={thread.price_max || 2147483647}
                    step="1"
                    required
                    value={amount}
                    onChange={(event) => onAmount(event.target.value)}
                    disabled={busy}
                    className="mt-1.5 h-11 w-full rounded-[12px] border-[1.5px] border-black bg-white px-3 text-[13px] font-black outline-none"
                  />
                </label>
                <label className="block text-[11px] font-black">
                  Proposal note <span className="font-medium text-black/35">Optional</span>
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={note}
                    onChange={(event) => onNote(event.target.value)}
                    disabled={busy}
                    placeholder="Scope, timeline, or context for this amount"
                    className="mt-1.5 min-h-[44px] w-full resize-y rounded-[12px] border-[1.5px] border-black bg-white p-3 text-[12px] outline-none"
                  />
                </label>
              </div>

              {error && <p className="mt-2 text-[11px] font-semibold text-red-600">{error}</p>}

              <div className="mt-3 flex justify-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="h-10 px-5 rounded-full border-[1.5px] border-black bg-[#0A13E6] text-white text-[11px] font-black disabled:opacity-50"
                >
                  {busy ? 'Sending…' : offers.length ? 'Send counter proposal' : 'Send proposal'}
                </button>
              </div>
            </form>
          )}

          <div className="mt-4">
            <NegotiationHistory offers={offers} thread={thread} userId={userId} />
          </div>
        </div>
      </div>
    </section>
  )
}

export default function Messages() {
  const [params, setParams] = useSearchParams()
  const selected = params.get('escrow')
  const [items, setItems] = useState([])
  const [cursor, setCursor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [paging, setPaging] = useState(false)
  const cursorInitialized = useRef(false)

  useEffect(() => {
    let stopped = false
    let timer
    const load = async () => {
      try {
        const data = await api.getConversations()
        if (stopped) return
        setItems((previous) => [
          ...data.conversations,
          ...previous.filter((old) => !data.conversations.some((fresh) => fresh.id === old.id)),
        ])
        if (!cursorInitialized.current) {
          setCursor(data.nextCursor)
          cursorInitialized.current = true
        }
        setError('')
      } catch (e) {
        if (!stopped) setError(e.message)
      } finally {
        if (!stopped) {
          setLoading(false)
          timer = setTimeout(load, 15000)
        }
      }
    }
    load()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [retry])

  async function moreConversations() {
    setPaging(true)
    try {
      const data = await api.getConversations(cursor)
      setItems((previous) => [
        ...previous,
        ...data.conversations.filter((next) => !previous.some((old) => old.id === next.id)),
      ])
      setCursor(data.nextCursor)
    } catch (e) {
      setError(e.message)
    } finally {
      setPaging(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <h1 className="text-[22px] font-bold">Messages</h1>
      <div className="grid md:grid-cols-[260px_minmax(0,1fr)] border-[1.5px] border-black rounded-[20px] bg-white overflow-hidden">
        <aside
          aria-label="Deal conversations"
          className={`${selected ? 'hidden md:block' : ''} md:border-r border-black/15 min-w-0`}
        >
          {error && (
            <div className="p-3">
              <ErrorNotice message={error} onRetry={() => setRetry((n) => n + 1)} />
            </div>
          )}
          {loading && <p className="p-5 text-sm text-black/50">Loading conversations...</p>}
          {!loading && !items.length && !error && (
            <div className="p-5 space-y-3 text-sm text-black/60">
              <p>No deal conversations yet.</p>
              <Link className="underline" to="/showroom">
                Browse talent
              </Link>
            </div>
          )}
          <ul className="max-h-[70dvh] overflow-y-auto divide-y divide-black/10">
            {items.map((item) => (
              <li key={item.id} className={`relative ${selected === item.id ? 'bg-[#0A13E6]/5' : ''}`}>
                <button
                  type="button"
                  onClick={() => setParams({ escrow: item.id })}
                  aria-current={selected === item.id ? 'page' : undefined}
                  aria-label={`Open conversation with ${getPrimaryIdentity(identityFromRow(item, 'peer')) || 'this user'} about ${item.hat_title}`}
                  className="absolute inset-0 w-full hover:bg-black/5"
                />
                <div
                  className={`pointer-events-none relative p-4 flex gap-3 min-w-0 ${
                    selected === item.id ? 'border-l-4 border-[#0A13E6]' : ''
                  }`}
                >
                  <UserIdentity
                    user={identityFromRow(item, 'peer')}
                    align="start"
                    gap="gap-3"
                    className="flex-1"
                    avatarClassName="w-9 h-9"
                    nameClassName="text-sm font-semibold"
                    usernameClassName="text-[11px] font-semibold text-black/50 leading-tight"
                  >
                    <span className="block text-xs text-black/60 truncate">{item.hat_title}</span>
                    <span className="block text-[11px] text-black/50 mt-1">
                      {item.agreed_at
                        ? `Agreed • ${money(item.amount, item.currency)}`
                        : item.price_type === 'range'
                          ? 'Negotiating price'
                          : item.status === 'secured'
                            ? workLabels[item.work_status]
                            : statusLabel[item.status]}
                    </span>
                  </UserIdentity>
                  {item.unread_count > 0 && (
                    <span
                      aria-label={`${item.unread_count} unread`}
                      className="self-start text-[10px] bg-[#0A13E6] text-white rounded-full px-1.5 py-0.5"
                    >
                      {item.unread_count}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {cursor && (
            <button type="button" className={`${button} m-3`} disabled={paging} onClick={moreConversations}>
              Load more deals
            </button>
          )}
        </aside>

        {selected ? (
          <BookingThread key={selected} id={selected} onBack={() => setParams({})} />
        ) : (
          <div className="hidden md:grid place-items-center min-h-[520px] text-sm text-black/50">
            Select a deal conversation.
          </div>
        )}
      </div>
    </div>
  )
}

function BookingThread({ id, onBack }) {
  const { user, refreshUser } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [syncError, setSyncError] = useState('')
  const [text, setText] = useState('')
  const [offerAmount, setOfferAmount] = useState('')
  const [offerNote, setOfferNote] = useState('')
  const [offerError, setOfferError] = useState('')
  const [offerMode, setOfferMode] = useState(false)
  const [offerBaseId, setOfferBaseId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState(false)
  const [paging, setPaging] = useState(false)
  const scrollRef = useRef(null)
  const mounted = useRef(true)
  const sequence = useRef(0)
  const retryPayload = useRef(null)
  const busyRef = useRef(false)

  const load = useCallback(async () => {
    const requestNumber = ++sequence.current
    const next = await api.getMessages(id)
    if (!mounted.current || requestNumber !== sequence.current) return
    const scroller = scrollRef.current
    const atBottom = !scroller || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 100
    setData(next)
    setSyncError('')
    if (atBottom) {
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      })
    }
    const lastId = next.messages.at(-1)?.id
    if (lastId && !document.hidden) {
      await api.messageAction({ action: 'read_messages', escrow_id: id, through_id: lastId })
    }
  }, [id])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      sequence.current++
    }
  }, [])

  useEffect(() => {
    const thread = data?.thread
    if (
      thread &&
      (thread.status !== 'not_funded' ||
        thread.checkout_locked_at ||
        thread.agreed_at ||
        !(thread.price_type === 'range' || thread.price_negotiable))
    ) {
      setOfferMode(false)
    }
  }, [data?.thread])

  useEffect(() => {
    busyRef.current = busy
  }, [busy])

  useEffect(() => {
    let stopped = false
    let timer
    const poll = async () => {
      try {
        if (!document.hidden && !history && !busyRef.current) await load()
      } catch (e) {
        if (!stopped) setSyncError(e.message)
      } finally {
        if (!stopped) timer = setTimeout(poll, 8000)
      }
    }
    poll()
    return () => {
      stopped = true
      sequence.current++
      clearTimeout(timer)
    }
  }, [load, history])

  async function run(operation) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await operation()
      setHistory(false)
    } catch (e) {
      if (mounted.current) setError(e.message)
    } finally {
      if (mounted.current) {
        try {
          await load()
        } catch (e) {
          setSyncError(e.message)
        }
        setBusy(false)
      }
    }
  }

  async function sendMessage(event) {
    event.preventDefault()
    if (busy || !text.trim()) return
    const payload = {
      action: 'send_message',
      escrow_id: id,
      body: text,
    }
    const fingerprint = JSON.stringify(payload)
    if (retryPayload.current?.fingerprint !== fingerprint) {
      retryPayload.current = { fingerprint, token: crypto.randomUUID() }
    }
    await run(async () => {
      await api.messageAction({ ...payload, client_token: retryPayload.current.token })
      retryPayload.current = null
      setText('')
    })
  }

  function openOffer(baseId = null) {
    const thread = data?.thread
    const suggested = data?.thread?.pending_offer?.amount || thread?.amount || thread?.price_min || ''
    setOfferBaseId(baseId)
    setOfferAmount(suggested ? String(suggested) : '')
    setOfferNote('')
    setOfferError('')
    setOfferMode(true)
  }

  function cancelOffer() {
    setOfferMode(false)
    setOfferAmount('')
    setOfferNote('')
    setOfferError('')
    setOfferBaseId(null)
  }

  async function submitOffer(event) {
    event.preventDefault()
    if (busy) return
    const thread = data.thread
    const amount = Number(offerAmount)
    if (!Number.isInteger(amount) || amount <= 0) {
      setOfferError('Enter a valid whole-number proposal.')
      return
    }
    if (thread.price_min != null && Number.isFinite(Number(thread.price_min)) && amount < Number(thread.price_min)) {
      setOfferError(`Proposal must be at least ${money(thread.price_min, thread.currency)}.`)
      return
    }
    if (thread.price_max != null && Number.isFinite(Number(thread.price_max)) && amount > Number(thread.price_max)) {
      setOfferError(`Proposal must not exceed ${money(thread.price_max, thread.currency)}.`)
      return
    }

    const payload = {
      action: 'make_offer',
      escrow_id: id,
      body: offerNote.trim(),
      amount,
      expected_offer_id: offerBaseId,
    }
    const fingerprint = JSON.stringify(payload)
    if (retryPayload.current?.fingerprint !== fingerprint) {
      retryPayload.current = { fingerprint, token: crypto.randomUUID() }
    }

    setOfferError('')
    setError('')
    setBusy(true)
    try {
      const result = await api.messageAction({ ...payload, client_token: retryPayload.current.token })
      retryPayload.current = null

      const createdAt = new Date().toISOString()
      const localOffer = {
        id: result.id,
        sender_id: user.id,
        kind: 'offer',
        body: offerNote.trim(),
        amount,
        currency: thread.currency || 'NGN',
        pay_unit: thread.pay_unit || null,
        offer_status: 'pending',
        created_at: createdAt,
        updated_at: createdAt,
      }

      setData((current) => {
        if (!current) return current
        const messages = current.messages.map((message) =>
          message.kind === 'offer' && message.offer_status === 'pending'
            ? { ...message, offer_status: 'superseded', updated_at: createdAt }
            : message,
        )
        if (!messages.some((message) => message.id === localOffer.id)) messages.push(localOffer)
        return {
          ...current,
          thread: { ...current.thread, pending_offer: localOffer },
          messages,
        }
      })
      cancelOffer()
      setHistory(false)
    } catch (e) {
      if (mounted.current) setOfferError(e.message)
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  async function older() {
    setPaging(true)
    setHistory(true)
    sequence.current++
    const oldHeight = scrollRef.current?.scrollHeight || 0
    try {
      const previous = await api.getMessages(id, data.nextCursor)
      if (!mounted.current) return
      setData((current) => ({
        ...current,
        messages: [...previous.messages, ...current.messages],
        nextCursor: previous.nextCursor,
      }))
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop += scrollRef.current.scrollHeight - oldHeight
        }
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setPaging(false)
    }
  }

  if (!data) {
    return (
      <section className="p-5 min-h-[420px] space-y-4">
        <button type="button" className={button} onClick={onBack}>
          Back to conversations
        </button>
        {syncError ? (
          <ErrorNotice message={syncError} onRetry={() => load().catch((e) => setSyncError(e.message))} />
        ) : (
          <p className="text-sm text-black/50">Loading conversation...</p>
        )}
      </section>
    )
  }

  const thread = data.thread
  const pending = thread.pending_offer
  const closed = ['cancelled', 'refunded'].includes(thread.status)
  const offers = data.messages.filter((message) => message.kind === 'offer')
  const pendingRespond = async (status) => {
    if (busy || !pending) return
    setBusy(true)
    setError('')
    try {
      await api.messageAction({
        action: 'respond_offer',
        escrow_id: id,
        offer_id: pending.id,
        status,
      })

      const updatedAt = new Date().toISOString()
      setData((current) => {
        if (!current) return current
        const messages = current.messages.map((message) =>
          message.id === pending.id
            ? { ...message, offer_status: status, updated_at: updatedAt }
            : message,
        )
        const threadUpdate = {
          ...current.thread,
          pending_offer: null,
        }
        if (status === 'accepted') {
          threadUpdate.amount = Number(pending.amount)
          threadUpdate.currency = pending.currency || current.thread.currency
          threadUpdate.pay_unit = pending.pay_unit || current.thread.pay_unit
          threadUpdate.agreed_at = updatedAt
        }
        return { ...current, thread: threadUpdate, messages }
      })
      setHistory(false)
    } catch (e) {
      if (mounted.current) setError(e.message)
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  return (
    <section className="min-w-0 flex flex-col">
      <header className="p-4 border-b border-black/10 space-y-3">
        <div className="flex gap-3 items-start">
          <button
            type="button"
            onClick={onBack}
            title="Back to conversations"
            aria-label="Back to conversations"
            className="md:hidden p-1"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <UserIdentity
              user={thread.peer}
              avatarClassName="w-9 h-9"
              nameAs="h2"
              nameClassName="text-sm font-bold"
              usernameClassName="text-[11px] font-semibold text-black/50 leading-tight"
            />
            <Link to={`/hat/${thread.hat_id}`} className="text-xs underline text-black/60 break-words">
              {thread.hat_title}
            </Link>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold">
              {money(thread.amount, thread.currency)}
              {thread.pay_unit ? ` /${thread.pay_unit}` : ''}
            </p>
            <p className="text-[11px] text-black/50">
              {thread.agreed_at
                ? 'Final deal price'
                : thread.price_type === 'range'
                  ? 'Negotiating'
                  : statusLabel[thread.status]}
            </p>
          </div>
        </div>

        <p className="flex items-start gap-2 text-xs text-black/60">
          {thread.contacts_unlocked ? (
            <UnlockKeyhole size={14} className="shrink-0" />
          ) : (
            <LockKeyhole size={14} className="shrink-0" />
          )}
          {thread.contacts_unlocked
            ? 'Contact details are available for this accepted deal.'
            : closed
              ? 'This deal is closed.'
              : 'Contact details become available after the request is accepted.'}
        </p>

        {thread.contacts_unlocked && (
          <div className="text-xs space-y-1 break-all">
            {thread.peer?.email && <p>{thread.peer.email}</p>}
            {thread.peer?.phone && <p>{thread.peer.phone}</p>}
          </div>
        )}

        {thread.checkout_locked_at && thread.status === 'not_funded' && (
          <p className="text-xs text-black/60">The agreed price is locked for checkout.</p>
        )}

        {thread.is_client && thread.contacts_unlocked && thread.status === 'not_funded' && (
          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              className={button}
              disabled={busy || Boolean(pending)}
              onClick={() => run(() => payForBooking(thread, user.email))}
            >
              Pay {money(thread.amount)} by card
            </button>
            {!thread.card_checkout_started && (user.walletBalance || 0) >= thread.amount && (
              <button
                type="button"
                className={button}
                disabled={busy || Boolean(pending)}
                onClick={() =>
                  run(async () => {
                    await api.fundEscrowWithWallet(id, thread.amount)
                    await refreshUser()
                  })
                }
              >
                Pay from wallet
              </button>
            )}
          </div>
        )}
      </header>

      {(thread.price_type === 'range' || thread.price_negotiable) && (
        <NegotiationPanel
          thread={thread}
          offers={offers}
          pending={pending}
          userId={user.id}
          busy={busy}
          offerMode={offerMode}
          amount={offerAmount}
          note={offerNote}
          error={offerError}
          onAmount={(value) => {
            setOfferAmount(value)
            setOfferError('')
          }}
          onNote={setOfferNote}
          onOpenOffer={openOffer}
          onCancelOffer={cancelOffer}
          onSubmitOffer={submitOffer}
          onRespond={pendingRespond}
        />
      )}

      {(thread.contacts_unlocked || thread.status !== 'not_funded') &&
        thread.status !== 'cancelled' && (
          <>
            <BookingProgress
              thread={thread}
              events={data.events}
              eventsCursor={data.eventsCursor}
              busy={busy}
              run={run}
              refreshUser={refreshUser}
            />
            {thread.status === 'secured' &&
              ['awaiting_start', 'awaiting_completion'].includes(thread.work_status) && (
                <DealQrCheckpoint
                  booking={thread}
                  role={thread.is_client ? 'client' : 'talent'}
                  onComplete={async () => {
                    await refreshUser()
                    await load()
                  }}
                />
              )}
          </>
        )}

      <div
        ref={scrollRef}
        role="region"
        aria-label="Message history"
        className="overflow-y-auto overscroll-contain p-4 space-y-3 h-[360px] md:h-[400px]"
      >
        {history && (
          <button
            type="button"
            className={button}
            onClick={() => {
              setHistory(false)
              load().catch((e) => setSyncError(e.message))
            }}
          >
            Return to latest messages
          </button>
        )}
        {data.nextCursor && (
          <div className="text-center">
            <button type="button" className={button} disabled={paging || busy} onClick={older}>
              {paging ? 'Loading...' : 'Load older messages'}
            </button>
          </div>
        )}
        {!data.messages.length && (
          <p className="text-sm text-center text-black/50 py-12">No messages yet.</p>
        )}
        {data.messages.map((message) => (
          <article
            key={message.id}
            className={`max-w-[88%] w-fit rounded-[14px] px-3 py-2.5 ${
              message.sender_id === user.id ? 'ml-auto bg-[#0A13E6]/10' : 'bg-black/5'
            }`}
          >
            <p className="text-[10px] font-semibold text-black/50 mb-1">
              {message.sender_id === user.id ? (
                'You'
              ) : (
                <UserIdentity
                  user={thread.peer}
                  layout="inline"
                  showAvatar={false}
                  nameClassName="font-semibold"
                  usernameClassName="font-semibold text-black/40"
                />
              )}
            </p>
            {message.kind === 'offer' && (
              <p className="text-sm font-semibold mb-1">
                Proposal: {money(message.amount, message.currency || thread.currency)}
                {(message.pay_unit || thread.pay_unit) ? ` /${message.pay_unit || thread.pay_unit}` : ''}{' '}
                <span className="font-normal text-xs text-black/45">
                  ({offerStatusLabel[message.offer_status] || message.offer_status})
                </span>
              </p>
            )}
            {message.body && (
              <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.body}</p>
            )}
            <time dateTime={message.created_at} className="block text-[10px] text-black/40 mt-1">
              {new Date(message.created_at).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          </article>
        ))}
      </div>

      <div className="border-t border-black/10 p-4 space-y-3">
        {error && <ErrorNotice message={error} />}
        {syncError && (
          <ErrorNotice message={syncError} onRetry={() => load().catch((e) => setSyncError(e.message))} />
        )}
        {closed ? (
          <p className="text-sm text-black/50">This conversation is read-only because the deal is closed.</p>
        ) : (
          <form onSubmit={sendMessage} className="space-y-2">
            <label htmlFor={`message-${id}`} className="text-xs font-semibold">
              Message
            </label>
            <textarea
              id={`message-${id}`}
              rows={2}
              maxLength={2000}
              required
              value={text}
              disabled={busy}
              onChange={(event) => setText(event.target.value)}
              placeholder="Discuss scope, timeline, delivery, or other deal details"
              className="w-full resize-y rounded-[14px] border-[1.5px] border-black/20 p-3 text-sm min-h-[70px] outline-none focus:border-black"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-black/40">{text.length}/2,000</span>
              <button
                type="submit"
                disabled={busy || !text.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#0A13E6] text-white rounded-full text-sm font-semibold disabled:opacity-50"
              >
                <Send size={14} />
                {busy ? 'Please wait...' : 'Send'}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  )
}
