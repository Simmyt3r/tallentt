import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { api } from '../lib/api.js'

// Exception-only self-service panel. Ordinary Showroom posts need no human approval.
export default function MyShowroomAppeals() {
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [notes, setNotes] = useState({})
  const [busy, setBusy] = useState('')
  const load = useCallback(async () => {
    try {
      const data = await api.getMyShowroomModeration()
      setItems(data.items || [])
      setError('')
    } catch (err) { setError(err.message || 'Unable to check Showroom moderation.') }
  }, [])
  useEffect(() => { load() }, [load])

  async function appeal(hatId) {
    if (busy) return
    setBusy(hatId)
    setError('')
    try {
      await api.submitShowroomAppeal(hatId, notes[hatId] || '')
      await load()
    } catch (err) { setError(err.message || 'Could not submit your appeal.') }
    finally { setBusy('') }
  }

  if (!items.length && !error) return null
  return (
    <section aria-label="My Showroom moderation" className="space-y-3 rounded-[18px] border border-amber-200 bg-amber-50/60 p-4">
      <h2 className="flex items-center gap-2 text-[14px] font-black"><AlertTriangle size={16} /> Showroom listing reviews</h2>
      <p className="text-[12px] text-black/60">These Hats are not currently shown in Showroom. Your existing deals are unaffected. You can update the Hat and appeal a restriction.</p>
      {error && <p role="alert" className="text-[12px] font-semibold text-red-700">{error}</p>}
      {items.map(item => {
        const pending = item.appeal_status === 'pending'
        const deniedRecently = item.appeal_status === 'denied' &&
          Date.now() - new Date(item.appeal_created_at).getTime() < 7 * 86400000
        return (
          <article key={item.hat_id} className="rounded-[14px] border border-black/10 bg-white p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-black">{item.hat_title}</p>
              <span className="text-[11px] font-bold text-amber-700">Restricted</span>
            </div>
            <p className="text-[12px] text-black/60">{pending ? 'Appeal awaiting admin review.' :
              deniedRecently ? 'Appeal denied. You may resubmit after seven days.' :
              'Review your content and explain why this restriction should be reconsidered.'}</p>
            {item.resolution_note && <p className="text-[12px] text-black/65">Review note: {item.resolution_note}</p>}
            {!pending && !deniedRecently && (
              <>
                <textarea aria-label={`Appeal for ${item.hat_title}`}
                  value={notes[item.hat_id] || ''} maxLength={1000} rows={3}
                  onChange={event => setNotes(prev => ({ ...prev, [item.hat_id]: event.target.value }))}
                  placeholder="Explain the correction or why the restriction is mistaken (15–1000 characters)."
                  className="w-full rounded-xl border border-black/15 p-3 text-[12px]" />
                <button type="button" disabled={Boolean(busy) || (notes[item.hat_id] || '').trim().length < 15}
                  onClick={() => appeal(item.hat_id)}
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-black px-4 text-[11px] font-bold text-white disabled:opacity-40">
                  <ShieldCheck size={14} /> {busy === item.hat_id ? 'Submitting…' : 'Appeal restriction'}
                </button>
              </>
            )}
          </article>
        )
      })}
    </section>
  )
}
