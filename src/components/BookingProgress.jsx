import { useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { api } from '../lib/api.js'
import { identityFromRow } from '../lib/profile.js'
import UserIdentity from './UserIdentity.jsx'

export const workLabels = {
  awaiting_start: 'Awaiting start QR scan',
  in_progress: 'Work in progress',
  submitted: 'Awaiting delivery review',
  revision_requested: 'Revisions requested',
  awaiting_completion: 'Approved: awaiting completion QR',
  disputed: 'Dispute under review',
  completed: 'Completed',
  refunded: 'Remaining escrow refunded',
}

export const eventLabels = {
  submit_delivery: 'Work submitted',
  request_revision: 'Revisions requested',
  scan_start: 'Start QR scanned; 30% released',
  scan_completion: 'Completion QR scanned; balance released',
  open_dispute: 'Dispute opened',
  approve_delivery: 'Delivery approved; completion QR ready',
  resolve_release: 'Admin released remaining escrow',
  resolve_refund: 'Admin refunded remaining escrow',
}

export const actionButton =
  'h-9 px-4 rounded-full border-[1.5px] border-black/15 bg-white text-[11px] font-black disabled:opacity-40 hover:border-black/35 transition'

export function BookingEvents({ events = [] }) {
  return (
    <ol className="space-y-4">
      {events.map((event) => (
        <li key={event.id} className="relative pl-6 min-w-0">
          <span className="absolute left-[3px] top-1.5 h-2.5 w-2.5 rounded-full bg-[#0A13E6]" />
          <span className="absolute left-[7px] top-4 -bottom-4 w-px bg-black/10 last:hidden" />
          <p className="text-[12px] font-black leading-snug">
            {eventLabels[event.action] || event.action}
          </p>
          <div className="mt-0.5 text-[11px] text-black/50">
            <UserIdentity
              user={identityFromRow(event, 'actor')}
              layout="inline"
              showAvatar={false}
              nameClassName="font-semibold"
              usernameClassName="font-semibold text-black/40"
            />
          </div>
          {event.note && (
            <p className="mt-1 text-[11px] text-black/60 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {event.note}
            </p>
          )}
          <time dateTime={event.created_at} className="mt-1 block text-[10px] text-black/35">
            {new Date(event.created_at).toLocaleString()}
          </time>
        </li>
      ))}
    </ol>
  )
}

export default function BookingProgress({
  thread,
  events,
  eventsCursor,
  busy,
  run,
  refreshUser,
  compact = false,
  showHistory = true,
  showActions = true,
}) {
  const [action, setAction] = useState('')
  const [note, setNote] = useState('')
  const [version, setVersion] = useState(null)
  const [older, setOlder] = useState([])
  const [cursor, setCursor] = useState(undefined)
  const [historyError, setHistoryError] = useState('')
  const [paging, setPaging] = useState(false)
  const retry = useRef(null)

  const available = thread.status === 'secured' && thread.work_status !== 'disputed'
  const actions =
    showActions && available
      ? [
          ...(!thread.is_client && ['in_progress', 'revision_requested'].includes(thread.work_status)
            ? ['submit_delivery']
            : []),
          ...(thread.is_client && thread.work_status === 'submitted'
            ? ['approve_delivery', 'request_revision']
            : []),
          'open_dispute',
        ]
      : []

  const labels = {
    submit_delivery: 'Submit work',
    approve_delivery: 'Approve delivery',
    request_revision: 'Request revisions',
    open_dispute: 'Open dispute',
  }
  const activeCursor = cursor === undefined ? eventsCursor : cursor

  async function submit(event) {
    event.preventDefault()
    const payload = { expected_version: version, note }
    const fingerprint = JSON.stringify({ action, ...payload })
    if (retry.current?.fingerprint !== fingerprint) {
      retry.current = { fingerprint, token: crypto.randomUUID() }
    }
    await run(async () => {
      await api.bookingAction(thread.id, action, {
        ...payload,
        client_token: retry.current.token,
      })
      setAction('')
      setNote('')
      retry.current = null
      await refreshUser()
    })
  }

  async function loadOlder() {
    setPaging(true)
    setHistoryError('')
    try {
      const data = await api.getBookingHistory(thread.id, activeCursor)
      setOlder((previous) => [...data.events, ...previous])
      setCursor(data.eventsCursor)
    } catch (err) {
      setHistoryError(err.message)
    } finally {
      setPaging(false)
    }
  }

  const allEvents = [
    ...new Map([...older, ...(events || [])].map((event) => [event.id, event])).values(),
  ].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))

  const title =
    thread.status === 'not_funded'
      ? 'Ready for payment'
      : workLabels[thread.work_status] || 'Deal progress'

  return (
    <section
      aria-label="Booking progress"
      className={
        compact
          ? 'mx-3 mt-2 rounded-[16px] border border-black/10 bg-[#FCFBF8] px-3.5 py-3'
          : 'rounded-[18px] border border-black/10 bg-white p-4'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-black/35">
            Deal status
          </p>
          <h3 className="mt-0.5 text-[13px] font-black">{title}</h3>
        </div>
        {thread.status === 'secured' && (
          <p className="text-[10px] font-bold text-black/45">
            {Number(thread.start_released_amount || 0).toLocaleString('en-NG')} /{' '}
            {Number(thread.amount || 0).toLocaleString('en-NG')} {thread.currency || 'NGN'} released
          </p>
        )}
      </div>

      {thread.work_status === 'disputed' && (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-800">
          Funds remain held while an admin reviews the dispute.
        </p>
      )}
      {!compact && thread.status === 'refunded' && (
        <p className="mt-2 text-[11px] text-black/60">
          The remaining escrow balance was returned to the client’s ChombuTar wallet. Any start
          payment already released remains with the talent.
        </p>
      )}
      {!compact && thread.status === 'released' && (
        <p className="mt-2 text-[11px] text-black/60">
          The booking amount has been released to the talent’s wallet.
        </p>
      )}

      {!!actions.length && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((item) => (
            <button
              key={item}
              type="button"
              className={
                item === 'approve_delivery' || item === 'submit_delivery'
                  ? `${actionButton} bg-[#0A13E6] text-white border-[#0A13E6]`
                  : actionButton
              }
              disabled={busy}
              onClick={() => {
                setAction(item)
                setVersion(thread.work_version)
                setNote('')
                retry.current = null
              }}
            >
              {labels[item]}
            </button>
          ))}
        </div>
      )}

      {action && (
        <form
          onSubmit={submit}
          className="mt-3 rounded-[14px] border border-black/10 bg-white p-3 space-y-2"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] font-black">{labels[action]}</p>
            <button
              type="button"
              className="text-[11px] font-bold text-black/45 underline"
              disabled={busy}
              onClick={() => setAction('')}
            >
              Cancel
            </button>
          </div>
          {action === 'approve_delivery' && (
            <p className="text-[11px] text-black/55">
              Approval enables the completion QR. The balance is released only after the talent
              scans it.
            </p>
          )}
          {action === 'open_dispute' && (
            <p className="text-[11px] text-black/55">
              Explain the issue so an admin can review the deal and remaining escrow.
            </p>
          )}
          <label className="block text-[11px] font-bold">
            {action === 'approve_delivery' ? 'Approval note (optional)' : 'Booking update'}
            <textarea
              aria-label={action === 'approve_delivery' ? 'Approval note (optional)' : 'Booking update'}
              required={action !== 'approve_delivery'}
              maxLength={2000}
              rows={3}
              value={note}
              disabled={busy}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1.5 block w-full resize-y rounded-[12px] border border-black/15 bg-[#FCFBF8] p-3 text-[12px] outline-none focus:border-black/40"
            />
          </label>
          {version !== thread.work_version && (
            <p role="alert" className="text-[11px] font-semibold text-red-700">
              The booking changed. Review the latest status and reopen this action.
            </p>
          )}
          <button
            className="h-9 px-4 rounded-full bg-[#0A13E6] text-white text-[11px] font-black disabled:opacity-50"
            disabled={busy || version !== thread.work_version}
          >
            Confirm {labels[action].toLowerCase()}
          </button>
        </form>
      )}

      {showHistory && !!allEvents.length && (
        <details className="mt-3 rounded-[14px] border border-black/10 bg-[#FCFBF8]">
          <summary className="cursor-pointer list-none px-3.5 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[12px] font-black">Booking history</p>
              <p className="text-[10px] text-black/40">{allEvents.length} updates</p>
            </div>
            <ChevronDown size={16} className="text-black/40" />
          </summary>
          <div className="border-t border-black/10 p-3.5 space-y-3">
            {activeCursor && (
              <button
                type="button"
                disabled={paging}
                className={actionButton}
                onClick={loadOlder}
              >
                {paging ? 'Loading…' : 'Load earlier updates'}
              </button>
            )}
            {historyError && (
              <p role="alert" className="text-[11px] font-semibold text-red-700">
                {historyError}
              </p>
            )}
            <BookingEvents events={allEvents} />
          </div>
        </details>
      )}
    </section>
  )
}
