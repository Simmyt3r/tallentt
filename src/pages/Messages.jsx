import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, RefreshCw, Send, X } from 'lucide-react'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import BookingProgress, { workLabels } from '../components/BookingProgress.jsx'
import DealQrCheckpoint from '../components/DealQrCheckpoint.jsx'
import EscrowFundingCard from '../components/EscrowFundingCard.jsx'
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

const button =
  'px-3 py-2 rounded-full border-[1.5px] border-black/20 text-xs font-semibold disabled:opacity-40 hover:bg-black/5 transition'

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

function DealDetailsSheet({
  thread,
  events,
  eventsCursor,
  busy,
  run,
  refreshUser,
  user,
  escrowId,
  onClose,
  onComplete,
}) {
  const status =
    ['secured', 'released', 'refunded'].includes(thread.status)
      ? workLabels[thread.work_status] || statusLabel[thread.status] || 'Active deal'
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

          {thread.contacts_unlocked && (thread.peer?.email || thread.peer?.phone) && (
            <div className="rounded-[16px] border border-black/10 bg-white p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.1em] text-black/35">Contact</p>
              {thread.peer?.email && <p className="mt-1 text-[12px] break-all">{thread.peer.email}</p>}
              {thread.peer?.phone && <p className="mt-1 text-[12px]">{thread.peer.phone}</p>}
            </div>
          )}

          {thread.is_client && thread.contacts_unlocked && thread.status === 'not_funded' && (
            <EscrowFundingCard
              amount={thread.amount}
              currency={thread.currency}
              walletBalance={user?.walletBalance || 0}
              busy={busy}
              returnTo={`/messages?escrow=${escrowId}`}
              blockedByNegotiation={
                Boolean(thread.pending_offer) ||
                ((thread.price_type === 'range' || thread.price_negotiable) && !thread.agreed_at)
              }
              negotiationUrl={`/negotiations?escrow=${escrowId}`}
              onFund={() =>
                run(async () => {
                  await api.fundEscrowWithWallet(escrowId, thread.amount)
                  await refreshUser()
                })
              }
            />
          )}

          {thread.status !== 'not_funded' && thread.status !== 'cancelled' && (
            <BookingProgress
              thread={thread}
              events={events}
              eventsCursor={eventsCursor}
              busy={busy}
              run={run}
              refreshUser={refreshUser}
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
    <div className="max-w-6xl mx-auto md:space-y-4">
      <h1 className={`${selected ? 'hidden md:block' : ''} text-[22px] font-bold mb-4 md:mb-0`}>Deals Chat</h1>
      <div
        className={`grid md:grid-cols-[260px_minmax(0,1fr)] border-[1.5px] border-black rounded-[20px] bg-white overflow-hidden ${
          selected
            ? '-mx-4 h-[calc(100dvh-152px)] min-h-0 rounded-none border-x-0 md:mx-0 md:h-[calc(100dvh-190px)] md:min-h-[520px] md:max-h-[760px] md:rounded-[20px] md:border-[1.5px]'
            : 'min-h-[560px]'
        }`}
      >
        <aside
          aria-label="Deal conversations"
          className={`${selected ? 'hidden md:flex' : 'flex'} md:border-r border-black/15 min-w-0 min-h-0 flex-col overflow-hidden`}
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
          <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-black/10">
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
                          ? 'Price in Negotiation Center'
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
    const lastId = next.messages.filter((message) => message.kind !== 'offer').at(-1)?.id
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
  const closed = ['cancelled', 'refunded'].includes(thread.status)
  const dealStatus =
    ['secured', 'released', 'refunded'].includes(thread.status)
      ? workLabels[thread.work_status] || statusLabel[thread.status] || 'Active deal'
      : statusLabel[thread.status] || thread.status
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
          <button
            type="button"
            onClick={() => setDealOpen(true)}
            className="shrink-0 rounded-full border border-black/10 bg-[#F5F3EF] px-2.5 py-1.5 text-[10px] font-black text-black/60 inline-flex items-center gap-1 hover:border-black/25"
            aria-label="View deal details"
          >
            Deal <ChevronRight size={13} />
          </button>
        </div>
        <div className="mt-2 ml-8 sm:ml-12 flex min-w-0 items-center gap-2 text-[10px] font-semibold text-black/45">
          <span className="truncate">{dealStatus}</span>
          <span aria-hidden="true">•</span>
          <span className="shrink-0 font-black text-black/65">{money(thread.amount, thread.currency)}</span>
        </div>
      </header>

      {((thread.price_type === 'range' || thread.price_negotiable) && !thread.agreed_at) ? (
        <Link
          to={`/negotiations?escrow=${id}`}
          className="shrink-0 mx-3 mt-2 min-h-10 rounded-[13px] border border-[#0A13E6]/20 bg-[#0A13E6]/5 px-3 py-2 flex items-center justify-between gap-3 text-[11px] font-bold text-[#0A13E6]"
        >
          <span className="truncate">Price needs agreement</span>
          <span className="shrink-0">Open Negotiation Center →</span>
        </Link>
      ) : thread.is_client && thread.contacts_unlocked && thread.status === 'not_funded' ? (
        <button
          type="button"
          onClick={() => setDealOpen(true)}
          className="shrink-0 mx-3 mt-2 min-h-10 rounded-[13px] border border-emerald-200 bg-emerald-50 px-3 py-2 flex items-center justify-between gap-3 text-left"
        >
          <span className="min-w-0">
            <span className="block text-[9px] font-black uppercase tracking-[0.08em] text-emerald-700">Action required</span>
            <span className="block truncate text-[11px] font-black text-emerald-950">Fund escrow</span>
          </span>
          <span className="shrink-0 text-[11px] font-black text-emerald-800">
            {(user.walletBalance || 0) >= Number(thread.amount || 0)
              ? money(thread.amount, thread.currency)
              : `Top up ${money(Math.max(0, Number(thread.amount || 0) - Number(user.walletBalance || 0)), thread.currency)}`}
          </span>
        </button>
      ) : thread.status === 'secured' && (
        (!thread.is_client && thread.work_status === 'awaiting_start') ||
        (thread.is_client && thread.work_status === 'awaiting_start') ||
        (!thread.is_client && ['in_progress', 'revision_requested'].includes(thread.work_status)) ||
        (thread.is_client && thread.work_status === 'submitted') ||
        (!thread.is_client && thread.work_status === 'awaiting_completion') ||
        (thread.is_client && thread.work_status === 'awaiting_completion')
      ) ? (
        <button
          type="button"
          onClick={() => setDealOpen(true)}
          className="shrink-0 mx-3 mt-2 min-h-10 rounded-[13px] border border-amber-300 bg-amber-50 px-3 py-2 flex items-center justify-between gap-3 text-left"
        >
          <span className="text-[9px] font-black uppercase tracking-[0.08em] text-amber-700">Action required</span>
          <span className="shrink-0 text-[11px] font-black text-amber-900">
            {thread.work_status === 'awaiting_start'
              ? thread.is_client ? 'Generate start QR' : 'Scan start QR'
              : thread.work_status === 'submitted'
                ? 'Review delivery'
                : thread.work_status === 'revision_requested'
                  ? 'Submit revised work'
                  : thread.work_status === 'in_progress'
                    ? 'Submit work'
                    : thread.is_client ? 'Generate completion QR' : 'Scan completion QR'}
          </span>
        </button>
      ) : null}

      <div
        ref={scrollRef}
        role="region"
        aria-label="Message history"
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-[#FAFAF8] px-3 sm:px-4 py-3 sm:py-4 space-y-2.5 scroll-smooth"
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
        {!data.messages.some((message) => message.kind !== 'offer') && (
          <div className="py-12 text-center">
            <p className="text-[13px] font-black text-black/45">No messages yet</p>
            <p className="mt-1 text-[11px] text-black/35">Start the conversation about this deal.</p>
          </div>
        )}
        {data.messages.filter((message) => message.kind !== 'offer').map((message) => {
          const own = message.sender_id === user.id
          return (
            <article
              key={message.id}
              className={`max-w-[88%] sm:max-w-[72%] w-fit rounded-[16px] px-3.5 py-2.5 shadow-sm ${
                own
                  ? 'ml-auto bg-[#0A13E6] text-white'
                  : 'bg-white text-black border border-black/[0.08]'
              }`}
            >
              {message.body && (
                <p className="text-[13px] leading-[1.45] whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
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

      <div className="shrink-0 border-t border-black/10 bg-white/98 backdrop-blur p-2.5 sm:p-3">
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
              className="min-h-[44px] max-h-24 flex-1 resize-none rounded-[22px] border-[1.5px] border-black/15 bg-[#FCFBF8] px-4 py-3 text-[13px] outline-none focus:border-black/35"
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
          events={data.events}
          eventsCursor={data.eventsCursor}
          busy={busy}
          run={run}
          refreshUser={refreshUser}
          user={user}
          escrowId={id}
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
