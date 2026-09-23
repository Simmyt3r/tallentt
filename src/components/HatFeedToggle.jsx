import { useRef, useState } from 'react'
import { api } from '../lib/api'
import Dialog from './hatform/Dialog'

export default function HatFeedToggle({ hat, onChange }) {
  const [busy, setBusy] = useState(false)
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [error, setError] = useState('')
  const saving = useRef(false)
  const visible = hat.feed_visible === true
  const titleId = `feed-notice-title-${hat.id}`
  const descriptionId = `feed-notice-description-${hat.id}`

  async function save(nextVisible, confirmed = false) {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    setError('')
    try {
      const data = await api.setHatFeedVisibility(hat.id, nextVisible, confirmed)
      onChange(data.hat)
      setNoticeOpen(false)
    } catch (e) {
      if (e.data?.code === 'NEGOTIATION_FEE_CONFIRMATION_REQUIRED') {
        setNoticeOpen(true)
      } else {
        setError(e.message || 'Could not update feed visibility. Try again.')
      }
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  function toggle() {
    setError('')
    if (!visible && hat.price_type === 'range') setNoticeOpen(true)
    else save(!visible)
  }

  function closeNotice() {
    if (saving.current) return
    setNoticeOpen(false)
    setError('')
  }

  return (
    <div className="rounded-[16px] border-[1.5px] border-black/15 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">Show in feed</p>
          <p id={`feed-status-${hat.id}`} className="text-[11px] text-black/50 mt-0.5" aria-live="polite">
            {busy ? 'Saving…' : visible ? 'On · Visible in the Bento feed' : 'Off · Hidden from the Bento feed'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={visible}
          aria-label={`Show ${hat.hat_name || hat.hat_title} in feed`}
          aria-describedby={`feed-status-${hat.id}`}
          disabled={busy}
          onClick={toggle}
          className="shrink-0 min-w-[48px] min-h-[44px] inline-flex items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A13E6] disabled:opacity-50"
        >
          <span className={`w-11 h-6 rounded-full p-0.5 transition-colors ${visible ? 'bg-[#0A13E6]' : 'bg-black/20'}`}>
            <span className={`block w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${visible ? 'translate-x-5' : 'translate-x-0'}`} />
          </span>
        </button>
      </div>
      {error && !noticeOpen && <p role="alert" className="text-[12px] text-red-600 mt-2">{error}</p>}
      <Dialog open={noticeOpen} onClose={closeNotice} variant="alert" role="alertdialog" labelledBy={titleId} describedBy={descriptionId}>
        <h2 id={titleId} className="text-[18px] font-bold">A negotiation fee applies</h2>
        <p id={descriptionId} className="text-[13px] text-black/70 mt-2 leading-relaxed">
          This Hat uses Range pricing. A negotiation fee applies when negotiating. Confirm to show this Hat in the Bento feed.
        </p>
        {error && <p role="alert" className="text-[12px] text-red-600 mt-3">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2 mt-5">
          <button type="button" disabled={busy} onClick={closeNotice} className="tw-btn-ghost h-11 px-4 disabled:opacity-50">Cancel</button>
          <button type="button" disabled={busy} onClick={() => save(true, true)} className="tw-btn-primary h-11 px-4 disabled:opacity-50">
            {busy ? 'Saving…' : 'Confirm and show'}
          </button>
        </div>
      </Dialog>
    </div>
  )
}
