import { useCallback, useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { api } from '../lib/api.js'
import { cldImage, cldVideoPoster } from '../lib/cloudinary.js'

export default function AdminShowroomMedia() {
  const [data, setData] = useState({ items: [], counts: {} })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)
  const refresh = useCallback(async () => {
    try { setData(await api.getAdminShowroomMedia()); setError('') }
    catch (err) { setError(err.message || 'Media review queue is unavailable.') }
  }, [])
  useEffect(() => { refresh() }, [refresh])
  async function decide(item, decision) {
    if (busy) return
    if (decision === 'approve' && !window.confirm('Have you personally inspected the image/video and verified its contact and safety content?')) return
    setBusy(item.media_id)
    try { await api.resolveAdminShowroomMedia(item.media_id, decision); await refresh() }
    catch (err) { setError(err.message || 'Could not update media.') }
    finally { setBusy(null) }
  }
  return (
    <section className="space-y-3 border-t border-black/10 pt-5" aria-label="Media screening exceptions">
      <h3 className="flex items-center gap-2 text-[15px] font-black"><ImageOff size={18}/> Media screening exceptions</h3>
      <p className="text-[12px] text-black/55">OCR or visual-safety concerns await human judgement. This does not automatically suspend the creator.</p>
      <p className="text-[11px] font-bold text-black/55">
        Pending: {data.counts.pending || 0} · Processing: {data.counts.processing || 0} ·
        Held: {data.counts.held || 0} · Rejected: {data.counts.rejected || 0}
      </p>
      <button type="button" onClick={refresh} className="h-9 rounded-full border border-black px-3 text-[11px] font-bold">Refresh</button>
      {error && <p role="alert" className="text-[12px] font-semibold text-red-700">{error}</p>}
      {!data.items.length && <p className="text-[12px] text-black/50">No media awaiting manual review.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {data.items.map(item => (
          <article key={item.media_id} className="overflow-hidden rounded-2xl border border-black/10 bg-white p-3 space-y-3">
            {item.type === 'video' ? (
              <video src={item.url} controls preload="none" className="aspect-video w-full rounded-lg bg-black object-contain" />
            ) : item.type === 'image' ? (
              <img src={cldImage(item.url, { w: 600 })} alt="Flagged media for manual review"
                className="aspect-video w-full rounded-lg bg-black/5 object-contain" />
            ) : <p className="text-[12px]">Non-visual media must be reviewed separately.</p>}
            <div>
              <p className="text-[13px] font-black">{item.hat_title}</p>
              <p className="text-[11px] text-black/55">@{item.owner_username} · {item.screening_status}</p>
              <p className="text-[11px] font-semibold text-amber-800">Signal: {item.screening_reason?.replaceAll('_', ' ') || 'Review required'}</p>
              <a href={`/hat/${item.hat_id}`} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-blue-700 underline">Inspect entire Hat</a>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={Boolean(busy)} onClick={() => decide(item, 'approve')}
                className="h-10 rounded-full bg-black px-4 text-[11px] font-bold text-white disabled:opacity-40">Approve media</button>
              {item.screening_status !== 'rejected' && (
                <button type="button" disabled={Boolean(busy)} onClick={() => decide(item, 'reject')}
                  className="h-10 rounded-full border border-red-700 px-4 text-[11px] font-bold text-red-700 disabled:opacity-40">Reject media</button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
