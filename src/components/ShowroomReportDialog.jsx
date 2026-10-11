import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Flag, X } from 'lucide-react'
import { api } from '../lib/api.js'

const REASONS = [
  ['contact_bypass', 'Contact details or off-platform payment'],
  ['spam', 'Spam or misleading content'],
  ['impersonation', 'Impersonation or fake identity'],
  ['unsafe_content', 'Unsafe or abusive content'],
  ['other', 'Something else'],
]

export default function ShowroomReportDialog({ hat, onClose, onReported }) {
  const [reason, setReason] = useState('contact_bypass')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const cancelRef = useRef(null)

  useEffect(() => {
    if (!hat) return undefined
    cancelRef.current?.focus()
    function handleKey(event) {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [hat, busy, onClose])

  if (!hat) return null
  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await api.reportShowroom(hat.id, reason)
      onReported(result.alreadyReported ? 'You have already reported this listing.' : 'Report received. Thank you for helping keep Showroom safe.')
    } catch (err) {
      setError(err.message || 'Could not submit report.')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/65 p-4" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose()
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="showroom-report-title"
        className="w-full max-w-[440px] rounded-[22px] border-[1.5px] border-black bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <h2 id="showroom-report-title" className="inline-flex items-center gap-2 text-[17px] font-black">
            <Flag size={18} /> Report Showroom post
          </h2>
          <button ref={cancelRef} type="button" onClick={onClose} disabled={busy} aria-label="Close report"
            className="grid h-10 w-10 place-items-center rounded-full border border-black/20 disabled:opacity-40">
            <X size={17} />
          </button>
        </div>
        <p className="mt-2 text-[12px] text-black/55">Choose the main concern. Reports are confidential and do not automatically ban the creator.</p>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-[11px] font-black uppercase tracking-wide text-black/45">Reason</legend>
            {REASONS.map(([value, label]) => (
              <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[12px] border border-black/10 px-3 py-2 text-[12px] font-semibold">
                <input type="radio" name="showroom-report-reason" value={value} checked={reason === value}
                  onChange={() => setReason(value)} className="accent-[#0A13E6]" />
                {label}
              </label>
            ))}
          </fieldset>
          {error && <p role="alert" className="rounded-[12px] bg-red-50 p-3 text-[12px] font-semibold text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="h-10 rounded-full border border-black px-4 text-[12px] font-bold disabled:opacity-40">Cancel</button>
            <button type="submit" disabled={busy} className="h-10 rounded-full bg-black px-4 text-[12px] font-bold text-white disabled:opacity-40">
              {busy ? 'Sending…' : 'Submit report'}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  )
}
