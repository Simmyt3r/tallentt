import { useCallback, useEffect, useState } from 'react'
import { Scale } from 'lucide-react'
import { api } from '../lib/api.js'

// Separate appeal queue: moderators handle disputes, not normal admission.
export default function AdminShowroomAppeals() {
  const [data, setData] = useState({ items: [], pending: 0 })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [notes, setNotes] = useState({})
  const refresh = useCallback(async () => {
    setLoading(true)
    try { setData(await api.getAdminShowroomAppeals()); setError('') }
    catch (err) { setError(err.message || 'Failed to load appeals.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { refresh() }, [refresh])

  async function resolve(item, decision) {
    if (busy) return
    if (!window.confirm(decision === 'approve'
      ? 'Restore this Hat to discovery after checking its content?'
      : 'Deny this creator appeal? The listing will remain restricted.')) return
    setBusy(item.id)
    try {
      await api.resolveAdminShowroomAppeal(item.id, decision, notes[item.id] || '')
      setNotice(decision === 'approve' ? 'Appeal approved. Listing restored.' : 'Appeal denied. Restriction remains.')
      setNotes(prev => ({ ...prev, [item.id]: '' }))
      await refresh()
    } catch (err) { setError(err.message || 'Failed to resolve appeal.') }
    finally { setBusy('') }
  }

  return (
    <section aria-label="Showroom appeal queue" aria-busy={loading} className="space-y-3 border-t border-black/10 pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-black"><Scale size={18} /> Appeals ({data.pending})</h3>
          <p className="text-[12px] text-black/55">Disputed restrictions only. Ordinary posts remain automatically eligible.</p>
        </div>
        <button type="button" onClick={refresh} disabled={loading || Boolean(busy)} className="min-h-11 rounded-full border border-black px-4 text-[12px] font-bold disabled:opacity-40">Refresh</button>
      </div>
      {error && <p role="alert" className="text-[12px] font-semibold text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-[#F7F3EB] p-3 text-[12px] font-semibold">{notice}</p>}
      {loading && !data.items.length && <p role="status" className="p-4 text-[12px] text-black/60">Loading appeals…</p>}
      {!loading && !error && !data.items.length && <p className="rounded-xl border border-dashed border-black/20 p-4 text-[12px] text-black/60">No creator appeals need a decision.</p>}
      {data.items.map(item => (
        <article key={item.id} className="space-y-3 rounded-2xl border border-black/10 bg-white p-4">
          <p className="text-[13px] font-black">{item.hat_title} · @{item.owner_username}</p>
          <p className="text-[12px] text-black/70 whitespace-pre-wrap">{item.explanation}</p>
          <a className="text-[12px] font-bold text-blue-700 underline" href={`/hat/${item.hat_id}`} target="_blank" rel="noreferrer">Inspect Hat</a>
          <textarea aria-label="Appeal resolution note" rows={2} maxLength={1000}
            placeholder="Optional resolution note for the creator"
            value={notes[item.id] || ''} onChange={e => setNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
            className="w-full rounded-xl border border-black/15 p-3 text-[12px]"/>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" disabled={Boolean(busy)} onClick={() => resolve(item, 'approve')}
              className="min-h-11 rounded-xl bg-black px-4 text-[12px] font-bold text-white disabled:opacity-40">
              {busy === item.id ? 'Saving…' : 'Approve & restore'}
            </button>
            <button type="button" disabled={Boolean(busy)} onClick={() => resolve(item, 'deny')}
              className="min-h-11 rounded-xl border border-black px-4 text-[12px] font-bold disabled:opacity-40">Deny appeal</button>
          </div>
        </article>
      ))}
    </section>
  )
}
