import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { actionButton, BookingEvents } from './BookingProgress.jsx'

const money = (n) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n)

export default function AdminDisputes() {
  const [status, setStatus] = useState('open')
  const [items, setItems] = useState([])
  const [cursor, setCursor] = useState(null)
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let stopped = false
    setBusy(true); setError(''); setItems([]); setCursor(null)
    api.getDisputes(status).then((data) => {
      if (!stopped) { setItems(data.disputes); setCursor(data.nextCursor) }
    }).catch((e) => { if (!stopped) setError(e.message) }).finally(() => { if (!stopped) setBusy(false) })
    return () => { stopped = true }
  }, [status, reload])

  async function more() {
    setBusy(true); setError('')
    try {
      const data = await api.getDisputes(status, cursor)
      setItems((previous) => [...previous, ...data.disputes.filter((d) => !previous.some((p) => p.escrow_id === d.escrow_id))]); setCursor(data.nextCursor)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  if (selected) return <DisputeDetail key={selected} id={selected} onBack={() => { setSelected(null); setReload((n) => n + 1) }} />
  return <section className="p-4 space-y-4" aria-label="Dispute queue">
    <div className="flex flex-wrap gap-3 items-center">
      <label className="text-xs font-semibold">Dispute status
        <select value={status} disabled={busy} onChange={(e) => setStatus(e.target.value)} className="ml-2 border border-black/20 rounded-lg p-2">
          <option value="open">Open</option><option value="released">Released to talent</option><option value="refunded">Refunded to client</option>
        </select>
      </label>
      <button type="button" className={actionButton} disabled={busy} onClick={() => setReload((n) => n + 1)}>Refresh disputes</button>
    </div>
    <p className="text-xs text-black/60">Oldest cases first. Review both parties’ evidence before settling funds. An admin cannot resolve their own booking.</p>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    {busy && <p className="text-xs">Loading disputes…</p>}
    {!busy && !items.length && !error && <p className="text-sm text-black/50">No disputes in this queue.</p>}
    <ul className="space-y-3">{items.map((d) => <li key={d.escrow_id} className="p-3 border border-black/15 rounded-lg space-y-2">
      <p className="text-sm font-bold break-words">{d.hat_title} · {money(d.amount)}</p>
      <p className="text-xs break-words">Client @{d.client_username} · Talent @{d.talent_username}</p>
      <p className="text-xs whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{d.reason}</p>
      <p className="text-[10px] text-black/50">Opened {new Date(d.created_at).toLocaleString()}</p>
      <button type="button" className={actionButton} onClick={() => setSelected(d.escrow_id)}>Review dispute</button>
    </li>)}</ul>
    {cursor && <button type="button" className={actionButton} disabled={busy} onClick={more}>Load more disputes</button>}
  </section>
}

function DisputeDetail({ id, onBack }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [outcome, setOutcome] = useState('')
  const [confirming, setConfirming] = useState(false)
  const retry = useRef(null)
  const mounted = useRef(true)
  async function load() {
    setError('')
    try { const next = await api.getDispute(id); if (mounted.current) setData(next) }
    catch (e) { if (mounted.current) setError(e.message) }
  }
  useEffect(() => { mounted.current = true; load(); return () => { mounted.current = false } }, [id])

  async function older(kind) {
    setBusy(true); setError('')
    try {
      const next = await api.getDispute(id, kind === 'messages' ? data.messagesCursor : null, kind === 'events' ? data.eventsCursor : null)
      setData((current) => ({ ...current, [kind]: [...next[kind], ...current[kind]], [`${kind}Cursor`]: next[`${kind}Cursor`] }))
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function resolve() {
    if (busy) return
    setBusy(true); setError('')
    const payload = { action: outcome, escrow_id: id, expected_version: data.dispute.work_version, note }
    const fingerprint = JSON.stringify(payload)
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, token: crypto.randomUUID() }
    try {
      await api.adminAction({ ...payload, client_token: retry.current.token })
      setConfirming(false); setNote(''); setOutcome(''); retry.current = null
      await load()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const d = data?.dispute
  return <section className="p-4 space-y-4" aria-label="Dispute review">
    <div className="flex flex-wrap gap-2"><button type="button" className={actionButton} disabled={busy} onClick={onBack}>Back to disputes</button>
      <button type="button" className={actionButton} disabled={busy} onClick={() => { setConfirming(false); load() }}>Refresh evidence</button></div>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    {!data && !error && <p className="text-sm">Loading case…</p>}
    {d && <>
      <h2 className="text-sm font-bold">Dispute · {money(d.amount)} · {d.status}</h2>
      <p className="text-xs break-words">Client @{d.client_username} · Talent @{d.talent_username}</p>
      <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{d.reason}</p>
      <h3 className="text-xs font-bold">Booking history</h3>
      {data.eventsCursor && <button type="button" className={actionButton} disabled={busy} onClick={() => older('events')}>Load earlier updates</button>}
      <BookingEvents events={data.events} />
      <h3 className="text-xs font-bold">Conversation evidence</h3>
      <div className="max-h-80 overflow-y-auto space-y-3 border border-black/15 rounded-lg p-3">
        {data.messagesCursor && <button type="button" className={actionButton} disabled={busy} onClick={() => older('messages')}>Load older evidence</button>}
        {!data.messages.length && <p className="text-xs text-black/50">No messages in this booking.</p>}
        {data.messages.map((m) => <article key={m.id} className="text-xs space-y-1">
          <p className="font-semibold">@{m.sender_username} · {new Date(m.created_at).toLocaleString()}</p>
          {m.kind === 'offer' && <p>Offer {money(m.amount)} · {m.offer_status}</p>}
          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.body}</p>
        </article>)}
      </div>
      {d.status === 'open' ? <form onSubmit={(e) => { e.preventDefault(); setConfirming(true) }} className="space-y-3 border-t border-black/15 pt-4">
        <label className="block text-xs font-semibold">Decision
          <select aria-label="Decision" required disabled={busy || confirming} value={outcome} onChange={(e) => setOutcome(e.target.value)} className="block w-full mt-1 p-2 border border-black/20 rounded-lg">
            <option value="">Choose a decision</option><option value="resolve_release">Release full amount to talent wallet</option><option value="resolve_refund">Refund full amount to client wallet</option>
          </select>
        </label>
        <label className="block text-xs font-semibold">Resolution reason
          <textarea aria-label="Resolution reason" required maxLength={2000} rows={3} disabled={busy || confirming} value={note} onChange={(e) => setNote(e.target.value)} className="block w-full mt-1 p-2 border border-black/20 rounded-lg" />
        </label>
        {confirming ? <div className="p-3 rounded-lg bg-amber-50 space-y-3">
          <p className="text-xs">Confirm {outcome === 'resolve_release' ? `release of ${money(d.amount)} to @${d.talent_username}` : `refund of ${money(d.amount)} to @${d.client_username}`} in their ChombuTar wallet. This closes the dispute and records your reason for both parties.</p>
          <div className="flex flex-wrap gap-2"><button type="button" className={actionButton} disabled={busy} onClick={resolve}>Confirm settlement</button>
            <button type="button" className={actionButton} disabled={busy} onClick={() => setConfirming(false)}>Edit decision</button></div>
        </div> : <button disabled={busy} className={actionButton}>Review settlement</button>}
      </form> : <div className="text-xs space-y-1"><p className="font-bold">Resolved {new Date(d.resolved_at).toLocaleString()}</p><p className="whitespace-pre-wrap break-words">{d.resolution_note}</p></div>}
    </>}
  </section>
}
