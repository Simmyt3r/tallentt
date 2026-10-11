import { useCallback, useEffect, useState } from 'react'
import { Flag, ShieldAlert } from 'lucide-react'
import { api } from '../lib/api.js'
import AdminShowroomAppeals from './AdminShowroomAppeals.jsx'
import AdminShowroomMedia from './AdminShowroomMedia.jsx'

export default function AdminShowroomReports() {
  const [data, setData] = useState({ items: [], flagged: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api.getAdminShowroomReports())
      setError('')
    } catch (err) {
      setError(err.message || 'Could not load the moderation queue.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function resolve(item, decision) {
    if (busy) return
    if (decision === 'restrict' && !window.confirm('Restrict this listing from discovery? The creator will be notified.')) return
    setBusy(item.hat_id)
    try {
      await api.resolveAdminShowroomReport(item.hat_id, decision)
      setData(prev => ({ ...prev, flagged: Math.max(0, prev.flagged - 1), items: prev.items.filter(row => row.hat_id !== item.hat_id) }))
      setError('')
    } catch (err) {
      setError(err.message || 'Could not resolve this report.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="p-4 md:p-5 space-y-4" aria-label="Flagged Showroom reports">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-[16px] font-black"><ShieldAlert size={18} /> Showroom exceptions</h3>
          <p className="mt-1 text-[12px] text-black/55">Showroom posts publish automatically. Only listings with repeated independent reports appear here.</p>
        </div>
        <button type="button" onClick={refresh} disabled={loading}
          className="h-10 rounded-full border border-black px-4 text-[11px] font-black disabled:opacity-50">
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <p className="text-[11px] font-bold text-black/55">Flagged listings: {data.flagged}</p>
      {error && <p role="alert" className="rounded-[12px] bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">{error}</p>}
      {loading && !data.items.length ? <p className="py-10 text-center text-[12px] text-black/45">Loading flagged posts…</p> : null}
      {!loading && !data.items.length ? (
        <div className="rounded-[18px] border border-dashed border-black/20 bg-white p-8 text-center">
          <Flag size={24} className="mx-auto text-black/30" />
          <p className="mt-2 text-[12px] font-semibold text-black/55">No Showroom reports currently need review.</p>
        </div>
      ) : null}
      <div className="grid gap-3">
        {data.items.map(item => (
          <article key={item.hat_id} className="flex flex-wrap gap-4 rounded-[17px] border border-black/10 bg-white p-4">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[13px] font-black">{item.hat_title}</p>
              <p className="text-[11px] font-medium text-black/50">@{item.owner_username} · {item.category}</p>
              <p className="text-[11px] font-semibold">{item.report_count} reports</p>
              {item.reasons && <p className="text-[11px] text-black/60">
                {Object.entries(item.reasons).map(([key, count]) => `${key.replaceAll('_', ' ')}: ${count}`).join(' · ')}
              </p>}
              <a href={`/showroom/${item.hat_id}`} target="_blank" rel="noreferrer"
                className="inline-block pt-1 text-[11px] font-bold text-[#0A13E6] underline">Inspect listing</a>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" disabled={Boolean(busy)} onClick={() => resolve(item, 'dismiss')}
                className="h-10 rounded-full border border-black px-4 text-[11px] font-bold disabled:opacity-40">Dismiss reports</button>
              <button type="button" disabled={Boolean(busy)} onClick={() => resolve(item, 'restrict')}
                className="h-10 rounded-full bg-red-700 px-4 text-[11px] font-bold text-white disabled:opacity-40">Restrict listing</button>
            </div>
          </article>
        ))}
      </div>
      <AdminShowroomAppeals />
      <AdminShowroomMedia />
    </section>
  )
}
