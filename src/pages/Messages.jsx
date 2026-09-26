import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, CircleCheck, RefreshCw, Send, X } from 'lucide-react'
import { api } from '../lib/api.js'
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

  // Once a deal is funded, negotiation becomes historical context inside
  // "View deal" rather than permanently occupying the conversation.
  if (hasAgreement && thread.status !== 'not_funded') return null

  return (
    <>
      <section className="mx-3 mt-2 rounded-[16px] border border-black/10 bg-[#FCFBF8] px-3.5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0A13E6]">
              Price negotiation
            </p>
            {hasAgreement ? (
              <>
                <p className="mt-0.5 text-[12px] font-bold text-black/45">Final agreed price</p>
                <p className="text-[18px] font-black text-emerald-700">
                  {money(thread.amount, thread.currency)}
                  {thread.pay_unit ? <span className="text-[11px]"> /{thread.pay_unit}</span> : null}
                </p>
              </>
            ) : pending ? (
              <>
                <p className="mt-0.5 text-[11px] font-bold text-black/45">
                  {ownPending ? 'Your proposal' : 'Proposal received'}
                </p>
                <p className="text-[18px] font-black">
                  {money(pending.amount, pending.currency || thread.currency)}
                  {(pending.pay_unit || thread.pay_unit) ? (
                    <span className="text-[11px] text-black/45"> /{pending.pay_unit || thread.pay_unit}</span>
                  ) : null}
                </p>
              </>
            ) : (
              <>
                <p className="mt-0.5 text-[12px] font-black">
                  {offers.length ? 'No active proposal' : 'Agree the final deal price'}
                </p>
                {range && (
                  <p className="text-[11px] font-semibold text-black/45">
                    Listed range: {range}{thread.pay_unit ? ` /${thread.pay_unit}` : ''}
                  </p>
                )}
              </>
            )}
          </div>

          {!hasAgreement && (
            <div className="flex flex-wrap gap-2">
              {pending ? (
                ownPending ? (
                  <>
                    <button type="button" className={button} disabled={busy} onClick={() => onRespond('withdrawn')}>
                      Withdraw
                    </button>
                    <button
                      type="button"
                      className="h-9 px-4 rounded-full bg-black text-white text-[11px] font-black disabled:opacity-40"
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
                      className="h-9 px-4 rounded-full bg-[#0A13E6] text-white text-[11px] font-black disabled:opacity-40"
                      disabled={busy}
                      onClick={() => onRespond('accepted')}
                    >
                      Accept proposal
                    </button>
                    <button type="button" className={button} disabled={busy} onClick={() => onRespond('declined')}>
                      Reject
                    </button>
                    <button
                      type="button"
                      className="h-9 px-4 rounded-full bg-black text-white text-[11px] font-black disabled:opacity-40"
                      disabled={busy || !negotiable}
                      onClick={() => onOpenOffer(pending.id)}
                    >
                      Counter
                    </button>
                  </>
                )
              ) : negotiable ? (
                <button
                  type="button"
                  className="h-9 px-4 rounded-full bg-[#0A13E6] text-white text-[11px] font-black"
                  onClick={() => onOpenOffer(null)}
                >
                  {offers.length ? 'Make new proposal' : 'Make first proposal'}
                </button>
              ) : null}
            </div>
          )}
        </div>
        {pending?.body && !hasAgreement && (
          <p className="mt-2 text-[11px] leading-relaxed text-black/55 line-clamp-2">{pending.body}</p>
        )}
      </section>

      {offerMode && negotiable && (
        <div
          className="fixed inset-0 z-[110] bg-black/45 p-3 sm:p-6 flex items-end sm:items-center justify-center"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onCancelOffer()
          }}
        >
          <form
            onSubmit={onSubmitOffer}
            className="w-full sm:max-w-[480px] rounded-t-[24px] sm:rounded-[24px] border-[1.5px] border-black bg-[#F7F3EB] p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0A13E6]">
                  Price negotiation
                </p>
                <h3 className="mt-1 text-[18px] font-black">
                  {offers.length ? 'Counter offer' : 'Make an offer'}
                </h3>
                {range && (
                  <p className="mt-1 text-[11px] font-semibold text-black/45">
                    Listed range: {range}{thread.pay_unit ? ` /${thread.pay_unit}` : ''}
                  </p>
                )}
              </div>
              <button type="button" onClick={onCancelOffer} aria-label="Close negotiation" className="p-2">
                <X size={18} />
              </button>
            </div>

            <label className="mt-4 block text-[11px] font-black">
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
                className="mt-1.5 h-12 w-full rounded-[14px] border-[1.5px] border-black bg-white px-3 text-[16px] font-black outline-none"
              />
            </label>

            <label className="mt-3 block text-[11px] font-black">
              Note <span className="font-medium text-black/35">Optional</span>
              <textarea
                rows={3}
                maxLength={500}
                value={note}
                onChange={(event) => onNote(event.target.value)}
                disabled={busy}
                placeholder="Scope, timeline, or context for this amount"
                className="mt-1.5 w-full resize-y rounded-[14px] border-[1.5px] border-black bg-white p-3 text-[12px] outline-none"
              />
            </label>

            {error && <p className="mt-2 text-[11px] font-semibold text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="mt-4 h-11 w-full rounded-full bg-[#0A13E6] text-white text-[12px] font-black disabled:opacity-50"
            >
              {busy ? 'Sending…' : offers.length ? 'Send counter proposal' : 'Send proposal'}
            </button>
          </form>
        </div>
      )}
    </>
  )
}

function DealDetailsSheet({
  thread,
  offers,
  userId,
  events,
  eventsCursor,
  busy,
  run,
  refreshUser,
  onClose,
  onComplete,
}) {
  const range = formatRange(thread)
  const status =
    thread.status === 'secured'
      ? workLabels[thread.work_status] || 'Active deal'
      : statusLabel[thread.status] || thread.status

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/45 p-3 sm:p-6 flex items-end sm:items-center justify-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Deal details"
        className="w-full sm:max-w-[560px] max-h-[88dvh] overflow-y-auto rounded-t-[26px] sm:rounded-[26px] border-[1.5px] border-black bg-[#F7F3EB] shadow-2xl"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-black/10 bg-[#F7F3EB]/95 backdrop-blur px-4 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0A13E6]">Deal details</p>
            <h2 className="mt-0.5 text-[18px] font-black">{thread.hat_title}</h2>
            <p className="text-[11px] font-semibold text-black/45">{status}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close deal details" className="p-2">
            <X size={18} />
          </button>
        </header>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-[16px] border border-black/10 bg-white p-3">
              <p className="text-[9px] font-black uppercase tracking-[0.1em] text-black/35">Deal price</p>
              <p className="mt-1 text-[17px] font-black">
                {money(thread.amount, thread.currency)}
                {thread.pay_unit ? <span className="text-[10px]"> /{thread.pay_unit}</span> : null}
              </p>
            </div>
            <div className="rounded-[16px] border border-black/10 bg-white p-3">
              <p className="text-[9px] font-black uppercase tracking-[0.1em] text-black/35">Status</p>
              <p className="mt-1 text-[12px] font-black">{status}</p>
            </div>
          </div>

          {range && (
            <div className="rounded-[16px] border border-black/10 bg-white p-3">
              <p className="text-[9px] font-black uppercase tracking-[0.1em] text-black/35">Listed range</p>
              <p className="mt-1 text-[12px] font-black">{range}{thread.pay_unit ? ` /${thread.pay_unit}` : ''}</p>
            </div>
          )}

          {thread.contacts_unlocked && (thread.peer?.email || thread.peer?.phone) && (
            <div className="rounded-[16px] border border-black/10 bg-white p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.1em] text-black/35">Contact</p>
              {thread.peer?.email && <p className="mt-1 text-[12px] break-all">{thread.peer.email}</p>}
              {thread.peer?.phone && <p className="mt-1 text-[12px]">{thread.peer.phone}</p>}
            </div>
          )}

          {!!offers.length && <NegotiationHistory offers={offers} thread={thread} userId={userId} />}

          {(thread.contacts_unlocked || thread.status !== 'not_funded') && thread.status !== 'cancelled' && (
            <BookingProgress
              thread={thread}
              events={events}
              eventsCursor={eventsCursor}
              busy={busy}
              run={run}
              refreshUser={refreshUser}
              showActions={false}
            />
          )}

          {thread.status === 'secured' &&
            ['awaiting_start', 'awaiting_completion'].includes(thread.work_status) && (
              <DealQrCheckpoint
                booking={thread}
                role={thread.is_client ? 'client' : 'talent'}
                onComplete={onComplete}
              />
            )}
        </div>
      </section>
    </div>
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
  const [dealOpen, setDealOpen] = useState(false)
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

  const dealStatus =
    thread.status === 'secured'
      ? workLabels[thread.work_status] || 'Active deal'
      : statusLabel[thread.status] || thread.status
  const qrAction =
    thread.status === 'secured' &&
    ['awaiting_start', 'awaiting_completion'].includes(thread.work_status)
  const showCompactProgress =
    thread.status === 'secured' &&
    !['awaiting_start', 'awaiting_completion'].includes(thread.work_status)

  return (
    <section className="min-w-0 min-h-0 h-full flex flex-col bg-white">
      <header className="shrink-0 border-b border-black/10 px-3 sm:px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            title="Back to conversations"
            aria-label="Back to conversations"
            className="md:hidden p-1 -ml-1"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <UserIdentity
              user={thread.peer}
              avatarClassName="w-9 h-9"
              nameAs="h2"
              nameClassName="text-[13px] font-black"
              usernameClassName="text-[10px] font-semibold text-black/45 leading-tight"
            >
              <Link
                to={`/hat/${thread.hat_id}`}
                className="block max-w-full truncate text-[10px] font-semibold text-black/45"
              >
                {thread.hat_title}
              </Link>
            </UserIdentity>
          </div>
          <span className="shrink-0 rounded-full bg-[#F5F3EF] px-2.5 py-1 text-[10px] font-black text-black/60">
            {dealStatus}
          </span>
        </div>
      </header>

      <div className="shrink-0 px-3 pt-2">
        <button
          type="button"
          onClick={() => setDealOpen(true)}
          className="w-full rounded-[15px] border border-black/10 bg-[#FCFBF8] px-3.5 py-2.5 flex items-center gap-3 text-left hover:border-black/20 transition"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-[0.1em] text-black/35">Deal</p>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[13px] font-black">
                {money(thread.amount, thread.currency)}
                {thread.pay_unit ? ` /${thread.pay_unit}` : ''}
              </span>
              <span className="text-[10px] font-semibold text-black/45">{dealStatus}</span>
            </div>
          </div>
          <span className="text-[10px] font-black text-[#0A13E6]">View deal</span>
          <ChevronRight size={16} className="text-black/35" />
        </button>
      </div>

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

      {thread.is_client && thread.contacts_unlocked && thread.status === 'not_funded' && (
        <div className="shrink-0 mx-3 mt-2 rounded-[16px] border border-[#0A13E6]/15 bg-[#0A13E6]/[0.04] px-3.5 py-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black">Ready to fund</p>
            <p className="text-[10px] text-black/45">Payment comes from your ChombuTar wallet.</p>
          </div>
          {(user.walletBalance || 0) >= thread.amount ? (
            <button
              type="button"
              className="h-9 px-4 rounded-full bg-[#0A13E6] text-white text-[11px] font-black disabled:opacity-50"
              disabled={busy || Boolean(pending)}
              onClick={() =>
                run(async () => {
                  await api.fundEscrowWithWallet(id, thread.amount)
                  await refreshUser()
                })
              }
            >
              Pay {money(thread.amount)} from wallet
            </button>
          ) : (
            <Link to="/wallet" className="h-9 px-4 rounded-full bg-[#0A13E6] text-white text-[11px] font-black inline-flex items-center">
              Top up wallet
            </Link>
          )}
        </div>
      )}

      {showCompactProgress && (
        <BookingProgress
          thread={thread}
          events={data.events}
          eventsCursor={data.eventsCursor}
          busy={busy}
          run={run}
          refreshUser={refreshUser}
          compact
          showHistory={false}
        />
      )}

      {qrAction && (
        <button
          type="button"
          onClick={() => setDealOpen(true)}
          className="shrink-0 mx-3 mt-2 rounded-[16px] border border-amber-300 bg-amber-50 px-3.5 py-3 flex items-center justify-between gap-3 text-left"
        >
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.1em] text-amber-700">Action required</p>
            <p className="mt-0.5 text-[12px] font-black">
              {thread.work_status === 'awaiting_start' ? 'Start QR checkpoint' : 'Completion QR checkpoint'}
            </p>
          </div>
          <span className="text-[10px] font-black text-amber-800">Open deal</span>
        </button>
      )}

      <div
        ref={scrollRef}
        role="region"
        aria-label="Message history"
        className="flex-1 min-h-[220px] overflow-y-auto overscroll-contain px-3 sm:px-4 py-4 space-y-3"
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
          <div className="py-12 text-center">
            <p className="text-[13px] font-black text-black/45">No messages yet</p>
            <p className="mt-1 text-[11px] text-black/35">Start the conversation about this deal.</p>
          </div>
        )}
        {data.messages.map((message) => {
          const own = message.sender_id === user.id
          return (
            <article
              key={message.id}
              className={`max-w-[84%] sm:max-w-[72%] w-fit rounded-[16px] px-3.5 py-2.5 ${
                own ? 'ml-auto bg-[#0A13E6] text-white' : 'bg-[#F3F3F3] text-black'
              }`}
            >
              {message.kind === 'offer' && (
                <div className={`mb-1.5 pb-1.5 border-b ${own ? 'border-white/20' : 'border-black/10'}`}>
                  <p className={`text-[9px] font-black uppercase tracking-[0.08em] ${own ? 'text-white/65' : 'text-black/40'}`}>
                    Proposal · {offerStatusLabel[message.offer_status] || message.offer_status}
                  </p>
                  <p className="mt-0.5 text-[14px] font-black">
                    {money(message.amount, message.currency || thread.currency)}
                    {(message.pay_unit || thread.pay_unit) ? ` /${message.pay_unit || thread.pay_unit}` : ''}
                  </p>
                </div>
              )}
              {message.body && (
                <p className="text-[12px] leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {message.body}
                </p>
              )}
              <time
                dateTime={message.created_at}
                className={`mt-1.5 block text-[9px] ${own ? 'text-white/60' : 'text-black/35'}`}
              >
                {new Date(message.created_at).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </article>
          )
        })}
      </div>

      <div className="shrink-0 border-t border-black/10 bg-white p-3 sm:p-4">
        {error && <ErrorNotice message={error} />}
        {syncError && (
          <div className="mb-2">
            <ErrorNotice message={syncError} onRetry={() => load().catch((e) => setSyncError(e.message))} />
          </div>
        )}
        {closed ? (
          <p className="text-[12px] text-center text-black/45">This deal is closed. The conversation is read-only.</p>
        ) : (
          <form onSubmit={sendMessage} className="flex items-end gap-2">
            <label htmlFor={`message-${id}`} className="sr-only">Message</label>
            <textarea
              id={`message-${id}`}
              rows={1}
              maxLength={2000}
              required
              value={text}
              disabled={busy}
              onChange={(event) => setText(event.target.value)}
              placeholder="Type a message…"
              className="min-h-[44px] max-h-28 flex-1 resize-none rounded-[22px] border-[1.5px] border-black/15 bg-[#FCFBF8] px-4 py-3 text-[12px] outline-none focus:border-black/35"
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={busy || !text.trim()}
              className="h-11 w-11 shrink-0 rounded-full bg-[#0A13E6] text-white grid place-items-center disabled:opacity-40"
            >
              <Send size={16} />
            </button>
          </form>
        )}
      </div>

      {dealOpen && (
        <DealDetailsSheet
          thread={thread}
          offers={offers}
          userId={user.id}
          events={data.events}
          eventsCursor={data.eventsCursor}
          busy={busy}
          run={run}
          refreshUser={refreshUser}
          onClose={() => setDealOpen(false)}
          onComplete={async () => {
            await refreshUser()
            await load()
          }}
        />
      )}
    </section>
  )

}
