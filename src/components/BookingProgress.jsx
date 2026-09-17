import { useRef, useState } from 'react'
import { api } from '../lib/api.js'

export const workLabels = { in_progress: 'Work in progress', submitted: 'Awaiting delivery review',
  revision_requested: 'Revisions requested', disputed: 'Dispute under review', completed: 'Completed', refunded: 'Refunded to wallet' }
export const eventLabels = { submit_delivery: 'Work submitted', request_revision: 'Revisions requested',
  open_dispute: 'Dispute opened', approve_delivery: 'Approved; payment released',
  resolve_release: 'Admin released payment', resolve_refund: 'Admin refunded the client wallet' }
export const actionButton = 'px-3 py-2 rounded-lg border border-black/20 text-xs font-semibold disabled:opacity-40 hover:bg-black/5'

export function BookingEvents({ events = [] }) {
  return <ol className="space-y-3">
    {events.map((event) => <li key={event.id} className="border-l-2 border-[#0A13E6]/30 pl-3 min-w-0">
      <p className="text-xs font-semibold">{eventLabels[event.action]} · @{event.actor_username}</p>
      {event.note && <p className="text-xs whitespace-pre-wrap break-words [overflow-wrap:anywhere] mt-1">{event.note}</p>}
      <time dateTime={event.created_at} className="text-[10px] text-black/50">{new Date(event.created_at).toLocaleString()}</time>
    </li>)}
  </ol>
}

export default function BookingProgress({ thread, events, eventsCursor, busy, run, refreshUser }) {
  const [action, setAction] = useState('')
  const [note, setNote] = useState('')
  const [version, setVersion] = useState(null)
  const [older, setOlder] = useState([])
  const [cursor, setCursor] = useState(undefined)
  const [historyError, setHistoryError] = useState('')
  const [paging, setPaging] = useState(false)
  const retry = useRef(null)
  const available = thread.status === 'secured' && thread.work_status !== 'disputed'
  const actions = available ? [
    ...(!thread.is_client && ['in_progress', 'revision_requested'].includes(thread.work_status) ? ['submit_delivery'] : []),
    ...(thread.is_client && thread.work_status === 'submitted' ? ['approve_delivery', 'request_revision'] : []),
    'open_dispute',
  ] : []
  const labels = { submit_delivery: 'Submit work', approve_delivery: 'Approve and release payment',
    request_revision: 'Request revisions', open_dispute: 'Open dispute' }
  const activeCursor = cursor === undefined ? eventsCursor : cursor

  async function submit(event) {
    event.preventDefault()
    const payload = { expected_version: version, note }
    const fingerprint = JSON.stringify({ action, ...payload })
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, token: crypto.randomUUID() }
    await run(async () => {
      await api.bookingAction(thread.id, action, { ...payload, client_token: retry.current.token })
      setAction(''); setNote(''); retry.current = null
      await refreshUser()
    })
  }

  async function loadOlder() {
    setPaging(true); setHistoryError('')
    try {
      const data = await api.getBookingHistory(thread.id, activeCursor)
      setOlder((previous) => [...data.events, ...previous])
      setCursor(data.eventsCursor)
    } catch (err) { setHistoryError(err.message) }
    finally { setPaging(false) }
  }
  const allEvents = [...new Map([...older, ...(events || [])].map((e) => [e.id, e])).values()]
    .sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1)

  return <section aria-label="Booking progress" className="border-b border-black/10 p-4 space-y-3 bg-[#F7F3EB]/50">
    <h3 className="text-sm font-bold">{thread.status === 'not_funded' ? 'Fund the booking to start work' : workLabels[thread.work_status] || 'Booking progress'}</h3>
    {thread.work_status === 'disputed' && <p className="text-xs text-black/65">Funds remain held until an admin resolves the dispute. Both parties can add evidence in this conversation. Admins can review its messages and booking history.</p>}
    {thread.status === 'refunded' && <p className="text-xs text-black/65">The full booking amount was returned to the client’s ChombuTar wallet. This is not a card or bank refund.</p>}
    {thread.status === 'released' && <p className="text-xs text-black/65">The full booking amount is in the talent’s wallet.</p>}
    <div className="flex flex-wrap gap-2">{actions.map((item) => <button key={item} type="button" className={actionButton} disabled={busy}
      onClick={() => { setAction(item); setVersion(thread.work_version); setNote(''); retry.current = null }}>{labels[item]}</button>)}</div>
    {action && <form onSubmit={submit} className="space-y-2">
      <p className="text-xs font-semibold">{labels[action]}</p>
      {action === 'approve_delivery' && <p className="text-xs">Confirm the work is complete. This releases the full payment to the talent’s wallet and closes the booking.</p>}
      {action === 'open_dispute' && <p className="text-xs">Explain the issue. An admin will review the booking history and conversation before deciding on a full release or wallet refund.</p>}
      <label className="block text-xs">{action === 'approve_delivery' ? 'Approval note (optional)' : 'Booking update'}
        <textarea aria-label={action === 'approve_delivery' ? 'Approval note (optional)' : 'Booking update'} required={action !== 'approve_delivery'} maxLength={2000}
          rows={3} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} className="block mt-1 p-2 border border-black/20 rounded-lg w-full text-sm" />
      </label>
      {version !== thread.work_version && <p role="alert" className="text-xs text-red-700">The booking changed. Review the latest history and reopen this action before submitting.</p>}
      <div className="flex flex-wrap gap-2">
        <button className={`${actionButton} bg-[#0A13E6] text-white`} disabled={busy || version !== thread.work_version}>Confirm {labels[action].toLowerCase()}</button>
        <button type="button" className={actionButton} disabled={busy} onClick={() => setAction('')}>Cancel</button>
      </div>
    </form>}
    {!!allEvents.length && <details open><summary className="text-xs font-semibold cursor-pointer mb-3">Booking history</summary>
      <div className="max-h-64 overflow-y-auto space-y-3">
        {activeCursor && <button type="button" disabled={paging} className={actionButton} onClick={loadOlder}>Load earlier updates</button>}
        {historyError && <p role="alert" className="text-xs text-red-700">{historyError}</p>}
        <BookingEvents events={allEvents} />
      </div>
    </details>}
  </section>
}
