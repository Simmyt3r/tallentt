import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, LockKeyhole, MessageCircle, RefreshCw, Send, UnlockKeyhole } from 'lucide-react'
import { api, payForBooking } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import BookingProgress, { workLabels } from '../components/BookingProgress.jsx'

const money = (amount) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount)
const statusLabel = { not_funded: 'Awaiting payment', secured: 'Payment secured', released: 'Payment released', cancelled: 'Cancelled', refunded: 'Refunded to wallet' }
const button = 'px-3 py-2 rounded-lg border border-black/20 text-xs font-semibold disabled:opacity-40 hover:bg-black/5'

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
        setItems((previous) => [...data.conversations, ...previous.filter((old) => !data.conversations.some((fresh) => fresh.id === old.id))])
        if (!cursorInitialized.current) { setCursor(data.nextCursor); cursorInitialized.current = true }
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
    return () => { stopped = true; clearTimeout(timer) }
  }, [retry])

  async function moreConversations() {
    setPaging(true)
    try {
      const data = await api.getConversations(cursor)
      setItems((previous) => [...previous, ...data.conversations.filter((next) => !previous.some((old) => old.id === next.id))])
      setCursor(data.nextCursor)
    } catch (e) { setError(e.message) }
    finally { setPaging(false) }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <h1 className="text-[22px] font-bold">Messages</h1>
      <div className="grid md:grid-cols-[260px_minmax(0,1fr)] border-[1.5px] border-black rounded-lg bg-white overflow-hidden">
        <aside aria-label="Booking conversations" className={`${selected ? 'hidden md:block' : ''} md:border-r border-black/15 min-w-0`}>
          {error && <div className="p-3"><ErrorNotice message={error} onRetry={() => setRetry((n) => n + 1)} /></div>}
          {loading && <p className="p-5 text-sm text-black/50">Loading conversations...</p>}
          {!loading && !items.length && !error && <div className="p-5 space-y-3 text-sm text-black/60">
            <p>No booking conversations yet.</p><Link className="underline" to="/showroom">Browse talent</Link>
          </div>}
          <ul className="max-h-[65dvh] overflow-y-auto divide-y divide-black/10">
            {items.map((item) => <li key={item.id}>
              <button type="button" onClick={() => setParams({ escrow: item.id })} aria-current={selected === item.id ? 'page' : undefined}
                className={`w-full text-left p-4 flex gap-3 min-w-0 hover:bg-black/5 ${selected === item.id ? 'bg-[#0A13E6]/5 border-l-4 border-[#0A13E6]' : ''}`}>
                <span className="w-9 h-9 bg-black/5 rounded-full shrink-0 grid place-items-center overflow-hidden">
                  {item.peer_avatar ? <img src={item.peer_avatar} alt="" className="w-full h-full object-cover" /> : <MessageCircle size={16} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold truncate">@{item.peer_username}</span>
                  <span className="block text-xs text-black/60 truncate">{item.hat_title}</span>
                  <span className="block text-[11px] text-black/50 mt-1">{item.status === 'secured' ? workLabels[item.work_status] : statusLabel[item.status]}</span>
                </span>
                {item.unread_count > 0 && <span aria-label={`${item.unread_count} unread`} className="self-start text-[10px] bg-[#0A13E6] text-white rounded-full px-1.5 py-0.5">{item.unread_count}</span>}
              </button>
            </li>)}
          </ul>
          {cursor && <button type="button" className={`${button} m-3`} disabled={paging} onClick={moreConversations}>Load more bookings</button>}
        </aside>
        {selected ? <BookingThread key={selected} id={selected} onBack={() => setParams({})} /> :
          <div className="hidden md:grid place-items-center min-h-[520px] text-sm text-black/50">Select a booking conversation.</div>}
      </div>
    </div>
  )
}

function ErrorNotice({ message, onRetry }) {
  return <div role="alert" className="text-xs text-red-700 bg-red-50 rounded-lg p-3 flex flex-wrap items-center gap-2">
    <span className="flex-1 min-w-0 break-words">{message}</span>
    {onRetry && <button type="button" title="Refresh" aria-label="Refresh" onClick={onRetry} className="p-2"><RefreshCw size={15} /></button>}
  </div>
}

function BookingThread({ id, onBack }) {
  const { user, refreshUser } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [syncError, setSyncError] = useState('')
  const [text, setText] = useState('')
  const [amount, setAmount] = useState('')
  const [offerMode, setOfferMode] = useState(false)
  const [offerBaseId, setOfferBaseId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState(false)
  const [paging, setPaging] = useState(false)
  const scrollRef = useRef(null)
  const mounted = useRef(true)
  const sequence = useRef(0)
  const retryPayload = useRef(null)

  const load = useCallback(async () => {
    const requestNumber = ++sequence.current
    const next = await api.getMessages(id)
    if (!mounted.current || requestNumber !== sequence.current) return
    const scroller = scrollRef.current
    const atBottom = !scroller || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 100
    setData(next)
    setSyncError('')
    if (atBottom) requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight })
    const lastId = next.messages.at(-1)?.id
    if (lastId && !document.hidden) {
      await api.messageAction({ action: 'read_messages', escrow_id: id, through_id: lastId })
    }
  }, [id])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; sequence.current++ }
  }, [])

  useEffect(() => {
    if (data && (data.thread.status !== 'not_funded' || data.thread.checkout_locked_at || !data.thread.price_negotiable)) setOfferMode(false)
  }, [data?.thread.status, data?.thread.checkout_locked_at, data?.thread.price_negotiable])

  function toggleOffer() {
    setOfferBaseId(data.thread.pending_offer?.id || null)
    setOfferMode((value) => !value)
  }

  useEffect(() => {
    let stopped = false
    let timer
    const poll = async () => {
      try { if (!document.hidden && !history && !busy) await load() }
      catch (e) { if (!stopped) setSyncError(e.message) }
      finally { if (!stopped) timer = setTimeout(poll, 8000) }
    }
    poll()
    return () => { stopped = true; sequence.current++; clearTimeout(timer) }
  }, [load, history, busy])

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
        try { await load() } catch (e) { setSyncError(e.message) }
        setBusy(false)
      }
    }
  }

  async function send(event) {
    event.preventDefault()
    if (busy) return
    const payload = { action: offerMode ? 'make_offer' : 'send_message', escrow_id: id, body: text,
      ...(offerMode ? { amount: Number(amount), expected_offer_id: offerBaseId } : {}) }
    const fingerprint = JSON.stringify(payload)
    if (retryPayload.current?.fingerprint !== fingerprint) retryPayload.current = { fingerprint, token: crypto.randomUUID() }
    await run(async () => {
      await api.messageAction({ ...payload, client_token: retryPayload.current.token })
      retryPayload.current = null
      setText(''); setAmount(''); setOfferMode(false)
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
      setData((current) => ({ ...current, messages: [...previous.messages, ...current.messages], nextCursor: previous.nextCursor }))
      requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop += scrollRef.current.scrollHeight - oldHeight })
    } catch (e) { setError(e.message) }
    finally { setPaging(false) }
  }

  if (!data) return <section className="p-5 min-h-[420px] space-y-4">
    <button type="button" className={button} onClick={onBack}>Back to conversations</button>
    {syncError ? <ErrorNotice message={syncError} onRetry={() => load().catch((e) => setSyncError(e.message))} /> : <p className="text-sm text-black/50">Loading conversation...</p>}
  </section>

  const thread = data.thread
  const pending = thread.pending_offer
  const negotiable = thread.price_negotiable && thread.status === 'not_funded' && !thread.checkout_locked_at
  const closed = ['cancelled', 'refunded'].includes(thread.status)
  const priceEditable = thread.status === 'not_funded' && !thread.checkout_locked_at
  const respond = (status) => run(() => api.messageAction({ action: 'respond_offer', escrow_id: id, offer_id: pending.id, status }))

  return <section className="min-w-0 flex flex-col">
    <header className="p-4 border-b border-black/10 space-y-3">
      <div className="flex gap-3 items-start">
        <button type="button" onClick={onBack} title="Back to conversations" aria-label="Back to conversations" className="md:hidden p-1"><ArrowLeft size={20} /></button>
        <div className="min-w-0 flex-1"><h2 className="text-sm font-bold break-words">@{thread.peer?.username}</h2>
          <Link to={`/talent/${thread.hat_id}`} className="text-xs underline text-black/60 break-words">{thread.hat_title}</Link></div>
        <div className="text-right shrink-0"><p className="text-sm font-bold">{money(thread.amount)}</p><p className="text-[11px] text-black/50">{statusLabel[thread.status]}</p></div>
      </div>
      <p className="flex items-start gap-2 text-xs text-black/60">
        {thread.contacts_unlocked ? <UnlockKeyhole size={14} className="shrink-0" /> : <LockKeyhole size={14} className="shrink-0" />}
        {thread.contacts_unlocked ? 'Contact sharing unlocked.' : closed ? 'Contact fields are hidden for this closed booking.' : 'Contact details and external links stay blocked until payment is secured.'}
      </p>
      {thread.contacts_unlocked && <div className="text-xs space-y-1 break-all">
        {thread.peer?.email && <p>{thread.peer.email}</p>}{thread.peer?.phone && <p>{thread.peer.phone}</p>}
      </div>}
      {thread.checkout_locked_at && thread.status === 'not_funded' && <p className="text-xs text-black/60">Price locked for checkout. Closing the payment window keeps this price locked.</p>}
      {thread.is_client && thread.status === 'not_funded' && <div className="flex flex-wrap gap-2 items-center">
        <button type="button" className={button} disabled={busy || Boolean(pending)} onClick={() => run(() => payForBooking(thread, user.email))}>Pay {money(thread.amount)} by card</button>
        {!thread.card_checkout_started && (user.walletBalance || 0) >= thread.amount && <button type="button" className={button} disabled={busy || Boolean(pending)}
          onClick={() => run(async () => { await api.fundEscrowWithWallet(id, thread.amount); await refreshUser() })}>Pay from wallet</button>}
        {pending && <p className="text-xs text-black/50">Resolve the pending offer before paying.</p>}
      </div>}
    </header>
    {thread.status !== 'cancelled' && <BookingProgress thread={thread} events={data.events} eventsCursor={data.eventsCursor}
      busy={busy} run={run} refreshUser={refreshUser} />}
    {pending && <div className="p-4 bg-[#0A13E6]/5 border-b border-black/10 space-y-2">
      <p className="text-sm font-semibold">{pending.sender_id === user.id ? 'Your offer' : 'Received offer'}: {money(pending.amount)}</p>
      {pending.body && <p className="text-xs whitespace-pre-wrap break-words">{pending.body}</p>}
      <div className="flex flex-wrap gap-2">
        {pending.sender_id === user.id ? <button type="button" className={button} disabled={busy || !priceEditable} onClick={() => respond('withdrawn')}>Withdraw offer</button> : <>
          <button type="button" className={`${button} bg-[#0A13E6] text-white`} disabled={busy || !priceEditable} onClick={() => respond('accepted')}>Accept {money(pending.amount)}</button>
          <button type="button" className={button} disabled={busy || !priceEditable} onClick={() => respond('declined')}>Decline</button>
        </>}
        <button type="button" className={button} disabled={busy || !negotiable} onClick={() => { setOfferBaseId(pending.id); setOfferMode(true) }}>Counteroffer</button>
      </div>
    </div>}
    <div ref={scrollRef} role="region" aria-label="Message history" className="overflow-y-auto overscroll-contain p-4 space-y-3 h-[360px] md:h-[400px]">
      {history && <button type="button" className={button} onClick={() => { setHistory(false); load().catch((e) => setSyncError(e.message)) }}>Return to latest messages</button>}
      {data.nextCursor && <div className="text-center"><button type="button" className={button} disabled={paging || busy} onClick={older}>{paging ? 'Loading...' : 'Load older messages'}</button></div>}
      {!data.messages.length && <p className="text-sm text-center text-black/50 py-12">No messages yet.</p>}
      {data.messages.map((message) => <article key={message.id} className={`max-w-[88%] w-fit rounded-lg px-3 py-2 ${message.sender_id === user.id ? 'ml-auto bg-[#0A13E6]/10' : 'bg-black/5'}`}>
        <p className="text-[10px] font-semibold text-black/50 mb-1">{message.sender_id === user.id ? 'You' : `@${thread.peer?.username}`}</p>
        {message.kind === 'offer' && <p className="text-sm font-semibold mb-1">Offer: {money(message.amount)} <span className="font-normal text-xs capitalize">({message.offer_status})</span></p>}
        {message.body && <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.body}</p>}
        <time dateTime={message.created_at} className="block text-[10px] text-black/40 mt-1">{new Date(message.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
      </article>)}
    </div>
    <div className="border-t border-black/10 p-4 space-y-3">
      {error && <ErrorNotice message={error} />}
      {syncError && <ErrorNotice message={syncError} onRetry={() => load().catch((e) => setSyncError(e.message))} />}
      {closed ? <p className="text-sm text-black/50">This conversation is read-only because the booking is closed.</p> : <form onSubmit={send} className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={`message-${id}`} className="text-xs font-semibold">{offerMode && negotiable ? 'Offer note' : 'Message'}</label>
          {negotiable && <button type="button" disabled={busy} className="text-xs underline" onClick={toggleOffer}>{offerMode ? 'Cancel offer' : 'Make an offer'}</button>}
        </div>
        {offerMode && negotiable && <label className="block text-xs">Offer amount (NGN)
          <input aria-label="Offer amount (NGN)" type="number" min="1" max="2147483647" step="1" required value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy}
            className="block mt-1 w-full rounded-lg border border-black/20 p-2 text-sm" />
        </label>}
        <textarea id={`message-${id}`} rows={2} maxLength={2000} required={!offerMode || !negotiable} value={text} disabled={busy}
          onChange={(event) => setText(event.target.value)} className="w-full resize-y rounded-lg border border-black/20 p-3 text-sm min-h-[70px]" />
        <div className="flex items-center justify-between gap-2"><span className="text-[10px] text-black/40">{text.length}/2,000</span>
          <button type="submit" disabled={busy || (offerMode && !negotiable)} className="inline-flex items-center gap-2 px-4 py-2 bg-[#0A13E6] text-white rounded-lg text-sm font-semibold disabled:opacity-50">
            <Send size={14} />{busy ? 'Please wait...' : offerMode && negotiable ? 'Send offer' : 'Send'}
          </button></div>
      </form>}
    </div>
  </section>
}
