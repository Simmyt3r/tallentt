import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { useBackdropClose, useDialog } from '../lib/dialog'
import { fmtMoney } from './bentoCardShared'

// "This price is negotiable…" confirmation, shown above the Showroom detail
// modal before a negotiable Hat is booked.
//
// It only informs and asks. It never creates a booking, starts a negotiation,
// touches the wallet or charges anything: Cancel simply closes it, and
// Continue hands control back to the caller, which passes the user on to the
// existing booking / negotiation flow.
//
// `fee` is optional and only used if the caller already has the real
// negotiation fee in hand (nothing in the app exposes one today, so it is not
// passed anywhere yet). Without it the generic wording is shown — a fee is
// never invented here.
export default function NegotiationNotice({ fee, onCancel, onContinue, returnFocusRef }) {
  const panelRef = useRef(null)
  const cancelRef = useRef(null)
  const backdrop = useBackdropClose(onCancel)
  // Only the topmost dialog answers Escape / traps focus (see lib/dialog.js),
  // so Escape here closes this notice and leaves the detail modal open.
  useDialog(panelRef, { onClose: onCancel, initialFocusRef: cancelRef, returnFocusRef })

  const hasFee = Number.isFinite(Number(fee)) && Number(fee) > 0
  const message = hasFee
    ? `This price is negotiable. A negotiation fee of ${fmtMoney(Number(fee))} will apply when you start negotiating.`
    : 'This price is negotiable. A negotiation fee will apply when you start negotiating.'

  return createPortal(
    <div
      {...backdrop}
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 sm:backdrop-blur-[2px]"
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sr-neg-title"
        aria-describedby="sr-neg-desc"
        tabIndex={-1}
        className="animate-slide-up w-full sm:w-[calc(100%-2rem)] sm:max-w-[400px] bg-white border-[1.5px] border-black rounded-t-[24px] sm:rounded-[24px] p-5 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:pb-6 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.35)] outline-none"
      >
        <h2 id="sr-neg-title" className="text-[18px] font-bold tracking-tight">
          Price Negotiation
        </h2>
        <p id="sr-neg-desc" className="text-[14px] text-black/70 leading-relaxed mt-2">
          {message}
        </p>
        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="tw-btn-ghost h-12 px-6 sm:min-w-[120px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="tw-btn-primary h-12 px-6 sm:min-w-[120px]"
          >
            Continue
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
