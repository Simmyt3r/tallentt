import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, MessageCircle, RefreshCw } from 'lucide-react'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { NegotiationPanel, NegotiationHistory } from '../components/NegotiationPanel.jsx'
import NegotiationParties from '../components/NegotiationParties.jsx'
import { identityFromRow } from '../lib/profile.js'

const tabs = ['Action needed', 'Ongoing', 'Completed']
const money = (amount, currency = 'NGN') => new Intl.NumberFormat('en-NG', {
  style: 'currency', currency: currency || 'NGN', maximumFractionDigits: 0,
}).format(Number(amount || 0))

function category(item, userId) {
  if (item.agreed_at || ['cancelled', 'refunded', 'released'].includes(item.status)) return 'Completed'
  if (!item.pending_offer_id || item.pending_offer_sender_id !== userId) return 'Action needed'
  return 'Ongoing'
}

export default function Negotiations() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const selected = params.get('escrow')
  const activeTab = tabs.includes(params.get('tab')) ? params.get('tab') : 'Action needed'
  const [items, setItems] = useState([])
  const [cursor, setCursor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [paging, setPaging] = useState(false)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const cursorInitialized = useRef(false)

  useEffect(() => {
    let cancelled = false
    let timer
    const load = async () => {
      try {
        const result = await api.getNegotiations()
        if (cancelled) return
        setItems((previous) => [...result.negotiations, ...previous.filter((item) => !result.negotiations.some((fresh) => fresh.id === item.id))])
        if (!cursorInitialized.current) {
          setCursor(result.nextCursor)
          cursorInitialized.current = true
        }
        setError('')
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) {
          setLoading(false)
          timer = setTimeout(load, 15000)
        }
      }
    }
    load()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [refresh])

  const updateSelection = (id, tab = activeTab) => {
    const next = new URLSearchParams()
    if (tab !== 'Action needed') next.set('tab', tab)
    if (id) next.set('escrow', id)
    setParams(next)
  }

  const visible = items.filter((item) => category(item, user.id) === activeTab)
  return (
    <main className="max-w-5xl mx-auto space-y-4 pb-8">
      <div className={selected ? 'hidden md:block' : ''}>
        <h1 className="text-[23px] font-black">Negotiation Center</h1>
        <p className="text-[12px] text-black/55">Only deals that enter price negotiation appear here. Completed is negotiation history only.</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[#0A13E6]/15 bg-[#0A13E6]/[0.04] px-4 py-3">
          <div>
            <p className="text-[11px] font-black text-[#0A13E6]">Price negotiation only</p>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-black/55">
              Offers and counteroffers happen here. Messaging stays in Deals Chat. Payment, escrow, QR checkpoints, delivery and disputes stay in My Deals.
            </p>
          </div>
          <Link
            to="/messages"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border-[1.5px] border-black bg-white px-4 text-[11px] font-black"
          >
            <MessageCircle size={14} /> Open Deals Chat
          </Link>
        </div>
      </div>
      <div className={selected ? 'hidden md:flex gap-2' : 'flex gap-2'} role="tablist" aria-label="Negotiation status">
        {tabs.map((tab) => {
          const count = items.filter((item) => category(item, user.id) === tab).length
          return (
            <button key={tab} type="button" role="tab" aria-selected={activeTab === tab}
              onClick={() => updateSelection(null, tab)}
              className={`rounded-full px-3 py-2 text-[11px] sm:text-xs font-bold whitespace-nowrap ${activeTab === tab ? 'bg-[#0A13E6] text-white' : 'bg-white border border-black/15 text-black/65'}`}>
              {tab} <span className="opacity-65">{count}</span>
            </button>
          )
        })}
      </div>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex justify-between gap-2">{error}<button type="button" onClick={() => setRefresh((v) => v + 1)} aria-label="Retry"><RefreshCw size={16} /></button></div>}
      <div className="grid md:grid-cols-[minmax(240px,350px)_minmax(0,1fr)] md:min-h-[520px] rounded-[20px] border-[1.5px] border-black bg-white overflow-hidden">
        <div className={`${selected ? 'hidden md:block' : ''} md:border-r border-black/10 min-w-0`}>
          {loading && <p className="p-5 text-sm text-black/55">Loading negotiations…</p>}
          {!loading && !visible.length && <p className="p-5 text-sm text-black/55">No negotiations in {activeTab.toLowerCase()}.</p>}
          <ul className="divide-y divide-black/10">
            {visible.map((item) => (
              <li key={item.id}>
                <button type="button" aria-current={selected === item.id ? 'page' : undefined}
                  onClick={() => updateSelection(item.id)}
                  className={`w-full text-left p-4 hover:bg-black/5 ${selected === item.id ? 'bg-[#0A13E6]/5 border-l-4 border-[#0A13E6]' : ''}`}>
                  <p className="text-[13px] font-black truncate">{item.hat_title}</p>
                  <p className="text-[11px] text-black/55 truncate">With {item.peer_full_name || item.peer_username || 'ChombuTar user'}</p>
                  <p className="mt-1 text-[11px] font-semibold text-[#0A13E6]">
                    {activeTab === 'Completed'
                      ? item.agreed_at
                        ? `Negotiation history • Agreed ${money(item.amount, item.currency)}`
                        : 'Negotiation history • Closed without agreement'
                      : item.pending_offer_id
                        ? `${item.pending_offer_sender_id === user.id ? 'Waiting for response' : 'Respond to'} ${money(item.pending_offer_amount, item.currency)}`
                        : 'Make a proposal'}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          {cursor && <button type="button" disabled={paging} onClick={async () => {
            setPaging(true)
            try {
              const result = await api.getNegotiations(cursor)
              setItems((previous) => [...previous, ...result.negotiations.filter((item) => !previous.some((old) => old.id === item.id))])
              setCursor(result.nextCursor)
            } catch (err) { setError(err.message) } finally { setPaging(false) }
          }} className="m-3 px-4 py-2 rounded-full border border-black/20 text-xs font-bold disabled:opacity-50">{paging ? 'Loading…' : 'Load more'}</button>}
        </div>
        {selected ? (
          <NegotiationDetail
            key={selected}
            id={selected}
            user={user}
            readOnly={activeTab === 'Completed'}
            onBack={() => updateSelection(null)}
            onUpdated={() => setRefresh((v) => v + 1)}
          />
        ) : (
          <div className="hidden md:grid place-items-center p-8 text-sm text-black/45">Select a negotiation to review the offer.</div>
        )}
      </div>
    </main>
  )
}

function NegotiationDetail({ id, user, readOnly, onBack, onUpdated }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [offerMode, setOfferMode] = useState(false)
  const [baseId, setBaseId] = useState(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [offerError, setOfferError] = useState('')
  const [older, setOlder] = useState([])
  const [cursor, setCursor] = useState(null)
  const token = useRef(null)
  const load = useCallback(async () => {
    const result = await api.getMessages(id)
    setData(result)
    setCursor(result.nextCursor)
    setLoading(false)
    await api.messageAction({ action: 'read_offers', escrow_id: id })
  }, [id])

  useEffect(() => {
    let cancelled = false
    let timer
    const poll = async () => {
      try { if (!document.hidden && !cancelled) await load() }
      catch (err) { if (!cancelled) { setError(err.message); setLoading(false) } }
      finally { if (!cancelled) timer = setTimeout(poll, 10000) }
    }
    poll()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [load])

  const thread = data?.thread
  const offers = [...older, ...(data?.messages || [])].filter((message) => message.kind === 'offer')
  const pending = thread?.pending_offer
  const openOffer = (expectedId = null) => {
    setBaseId(expectedId)
    setAmount(String(pending?.amount || thread.amount || thread.price_min || ''))
    setNote('')
    setOfferError('')
    setOfferMode(true)
  }
  const act = async (body, onSuccess) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await api.messageAction({ ...body, escrow_id: id })
      onSuccess?.()
      await load()
      onUpdated()
    } catch (err) { setError(err.message); if (body.action === 'make_offer') setOfferError(err.message) }
    finally { setBusy(false) }
  }
  const submitOffer = async (event) => {
    event.preventDefault()
    const value = Number(amount)
    if (!Number.isSafeInteger(value) || value <= 0 ||
        (thread.price_min != null && value < Number(thread.price_min)) ||
        (thread.price_max != null && value > Number(thread.price_max))) {
      setOfferError('Enter a whole-number amount within the listed range.')
      return
    }
    const payload = { action: 'make_offer', amount: value, body: note.trim(), expected_offer_id: baseId }
    const fingerprint = JSON.stringify(payload)
    if (token.current?.fingerprint !== fingerprint) token.current = { fingerprint, value: crypto.randomUUID() }
    await act({ ...payload, client_token: token.current.value }, () => {
      token.current = null
      setOfferMode(false)
    })
  }

  return (
    <section className="min-w-0 p-3 sm:p-5 space-y-4" aria-label="Negotiation details">
      <button type="button" onClick={onBack} className="md:hidden inline-flex items-center gap-1 text-xs font-bold"><ArrowLeft size={16} /> Back to negotiations</button>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
      {loading && <p className="text-sm text-black/55">Loading negotiation…</p>}
      {thread && <>
        <header>
          <h2 className="text-lg font-black">{thread.hat_title}</h2>
          <p className="text-xs text-black/50">Client and Talent</p>
          <NegotiationParties currentUser={user} peer={thread.peer} currentRole={thread.is_client ? 'client' : 'talent'} />
        </header>
        {readOnly || thread.agreed_at || ['cancelled', 'refunded', 'released'].includes(thread.status) ? (
          <section className="space-y-3">
            <div className="rounded-[16px] border border-black/10 bg-[#F7F3EB] p-3.5">
              <p className="text-[10px] font-black uppercase tracking-[0.1em] text-black/40">Negotiation history</p>
              <p className="mt-1 text-[13px] font-black">
                {thread.agreed_at
                  ? `Final agreed price: ${money(thread.amount, thread.currency)}`
                  : 'Negotiation closed without a final agreement'}
              </p>
              <p className="mt-1 text-[10.5px] text-black/50">
                This record is read-only. Deal management happens in My Deals.
              </p>
            </div>
            {offers.length > 0 ? (
              <NegotiationHistory offers={offers} thread={thread} userId={user.id} />
            ) : (
              <p className="text-xs text-black/45">No proposal history is available.</p>
            )}
          </section>
        ) : (thread.price_type === 'range' || thread.price_negotiable) ? (
          <>
            <NegotiationPanel thread={thread} offers={offers} pending={pending} userId={user.id} currentUser={user}
              showParties={false}
              busy={busy} offerMode={offerMode} amount={amount} note={note} error={offerError}
              onAmount={(value) => { setAmount(value); setOfferError('') }} onNote={setNote}
              onOpenOffer={openOffer} onCancelOffer={() => { setOfferMode(false); setOfferError('') }}
              onSubmitOffer={submitOffer}
              onRespond={(status) => act({ action: 'respond_offer', offer_id: pending.id, status })} />
            {offers.length > 0 && <NegotiationHistory offers={offers} thread={thread} userId={user.id} />}
          </>
        ) : (
          <p className="rounded-[14px] border border-black/10 bg-[#F7F3EB] p-3 text-xs text-black/55">
            This deal uses a fixed price and does not belong in Negotiation Center.
          </p>
        )}
        {cursor && <button type="button" onClick={async () => {
          try {
            const result = await api.getMessages(id, cursor)
            setOlder((current) => [...result.messages, ...current])
            setCursor(result.nextCursor)
          } catch (err) { setError(err.message) }
        }} className="rounded-full border border-black/20 px-4 py-2 text-xs font-bold">Load older proposals</button>}
      </>}
    </section>
  )
}
