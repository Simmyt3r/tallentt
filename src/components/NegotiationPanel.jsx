import { X } from 'lucide-react'
import NegotiationParties from './NegotiationParties.jsx'

const money = (amount, currency = 'NGN') => new Intl.NumberFormat('en-NG', { style: 'currency', currency: currency || 'NGN', maximumFractionDigits: 0 }).format(Number(amount || 0))
const offerStatusLabel = { pending: 'Awaiting response', accepted: 'Accepted', declined: 'Rejected', withdrawn: 'Withdrawn', superseded: 'Countered' }
const button = 'px-3 py-2 rounded-full border-[1.5px] border-black/20 text-xs font-semibold disabled:opacity-40 hover:bg-black/5 transition'
function formatRange(thread) {
  if (thread.price_type !== 'range') return null
  const min = Number(thread.price_min), max = Number(thread.price_max)
  if (Number.isFinite(min) && Number.isFinite(max) && max > min) return `${money(min, thread.currency)} – ${money(max, thread.currency)}`
  if (Number.isFinite(min) && min > 0) return money(min, thread.currency)
  return 'Flexible'
}

export function NegotiationHistory({ offers, thread, userId }) {
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

export function NegotiationPanel({
  thread,
  offers,
  pending,
  userId,
  currentUser,
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
  showParties = true,
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
        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0A13E6]">
          Price negotiation
        </p>
        {showParties && <NegotiationParties
          currentUser={currentUser}
          peer={thread.peer}
          currentRole={thread.is_client ? 'client' : 'talent'}
        />}
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
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
                    <button type="button" className={button} disabled={busy || !negotiable} onClick={() => onRespond('withdrawn')}>
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
                      disabled={busy || !negotiable}
                      onClick={() => onRespond('accepted')}
                    >
                      Accept proposal
                    </button>
                    <button type="button" className={button} disabled={busy || !negotiable} onClick={() => onRespond('declined')}>
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

            <div className="mt-4">
              <NegotiationParties
                currentUser={currentUser}
                peer={thread.peer}
                currentRole={thread.is_client ? 'client' : 'talent'}
                compact
              />
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
