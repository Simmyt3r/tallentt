import { useCallback, useEffect, useState } from 'react'
import { Scale } from 'lucide-react'
import { api } from '../lib/api.js'

// Separate appeal queue: moderators handle disputes, not normal admission.
export default function AdminShowroomAppeals() {
  const [data, setData] = useState({ items: [], pending: 0 })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [notes, setNotes] = useState({})
  const refresh = useCallback(async () => {
    try { setData(await api.getAdminShowroomAppeals()); setError('') }
    catch (err) { setError(err.message || 'Failed to load appeals.') }
  }, [])
  useEffect(() => { refresh() }, [refresh])

  async function resolve(item, decision) {
    if (busy) return
    if (decision === 'approve' && !window.confirm('Restore this Hat to discovery after checking its content?')) return
    setBusy(item.id)
    try {
      await api.resolveAdminShowroomAppeal(item.id, decision, notes[item.id] || '')
      await refresh()
    } catch (err) { setError(err.message || 'Failed to resolve appeal.') }
    finally { setBusy('') }
  }

  return (
    <section aria-label="Showroom appeal queue" className="space-y-3 border-t border-black/10 pt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-black"><Scale size={18} /> Appeals ({data.pending})</h3>
          <p className="text-[12px] text-black/55">Disputed restrictions only. Ordinary posts remain automatically eligible.</p>
        </div>
        <button type="button" onClick={refresh} className="h-9 rounded-full border border-black px-3 text-[11px] font-bold">Refresh</button>
      </div>
      {error && <p role="alert" className="text-[12px] font-semibold text-red-700">{error}</p>}
      {!data.items.length && <p className="text-[12px] text-black/50">No appeals awaiting review.</p>}
      {data.items.map(item => (
        <article key={item.id} className="space-y-3 rounded-2xl border border-black/10 bg-white p-4">
          <p className="text-[13px] font-black">{item.hat_title} · @{item.owner_username}</p>
          <p className="text-[12px] text-black/70 whitespace-pre-wrap">{item.explanation}</p>
          <a className="text-[12px] font-bold text-blue-700 underline" href={`/showroom/${item.hat_id}`} target="_blank" rel="noreferrer">Inspect Hat</a>
          <textarea aria-label="Appeal resolution note" rows={2} maxLength={1000}
            placeholder="Optional resolution note for the creator"
            value={notes[item.id] || ''} onChange={e => setNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
            className="w-full rounded-xl border border-black/15 p-3 text-[12px]"/>
          <div className="flex gap-2">
            <button type="button" disabled={Boolean(busy)} onClick={() => resolve(item, 'approve')}
              className="h-10 rounded-full bg-black px-4 text-[11px] font-bold text-white disabled:opacity-40">
              {busy === item.id ? 'Saving…' : 'Approve & restore'}
            </button>
            <button type="button" disabled={Boolean(busy)} onClick={() => resolve(item, 'deny')}
              className="h-10 rounded-full border border-black px-4 text-[11px] font-bold disabled:opacity-40">Deny appeal</button>
          </div>
        </article>
      ))}
    </section>
  )
}
