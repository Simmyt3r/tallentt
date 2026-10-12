import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ImageOff, RefreshCw, RotateCcw } from 'lucide-react'
import { api } from '../lib/api.js'
import { cldImage } from '../lib/cloudinary.js'

const REASONS = {
  contact_details_in_media: 'Contact details detected in the media',
  possible_unsafe_media: 'Possible unsafe content',
  unverified_media_source: 'Media source requires verification',
  audio_requires_manual_review: 'Audio needs a human review',
  asset_used_by_another_creator: 'The same asset was used by another creator',
  screening_unavailable: 'Automated screening failed after retries',
}

export default function AdminShowroomMedia() {
  const [data, setData] = useState({ items: [], counts: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api.getAdminShowroomMedia())
      setError('')
    } catch (err) {
      setError(err.message || 'The media review queue is unavailable. Try refreshing.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function decide(item, decision) {
    if (busy) return
    const approve = decision === 'approve'
    const question = approve
      ? 'Approve this media for public discovery? Confirm that you inspected the full image, video or audio.'
      : 'Reject this media? It will remain hidden from the Showroom.'
    if (!window.confirm(question)) return
    setBusy(item.media_id)
    setError('')
    setNotice('')
    try {
      await api.resolveAdminShowroomMedia(item.media_id, decision)
      setNotice(approve ? 'Media approved after review.' : 'Media rejected and remains hidden.')
      await refresh()
    } catch (err) { setError(err.message || 'Could not update this media.') }
    finally { setBusy(null) }
  }

  async function retry(item) {
    if (busy) return
    setBusy(item.media_id)
    setError('')
    setNotice('')
    try {
      await api.retryAdminShowroomMedia(item.media_id)
      setNotice('The media was returned to the screening queue.')
      await refresh()
    } catch (err) { setError(err.message || 'Could not retry this media.') }
    finally { setBusy(null) }
  }

  const count = data.counts || {}
  return (
    <section className="space-y-4 border-t border-black/10 pt-5" aria-label="Media screening exceptions" aria-busy={loading}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-[16px] font-black"><ImageOff size={18}/> Media awaiting review</h3>
          <p className="mt-1 max-w-xl text-[13px] text-black/65">
            Review flagged files before making them public. Holds affect this media, not the creator's entire account.
          </p>
        </div>
        <button type="button" onClick={refresh} disabled={loading || Boolean(busy)}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-black px-4 text-[12px] font-bold disabled:opacity-40">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Media moderation counts">
        {[
          ['Waiting to scan',count.pending || 0],
          ['Being scanned',count.processing || 0],
          ['Held for review',count.held || 0],
          ['Rejected',count.rejected || 0],
        ].map(([name,value])=>(
          <div key={name} className="rounded-xl border border-black/10 bg-[#F7F3EB] p-3">
            <p className="text-[19px] font-black tabular-nums">{loading && !data.items.length ? '…' : value}</p>
            <p className="text-[11px] font-semibold text-black/65">{name}</p>
          </div>
        ))}
      </div>

      {data.screeningEnabled && (!data.providerConfigured || !data.workerConfigured) && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] font-semibold text-amber-900">
          <AlertTriangle size={16} className="shrink-0"/>
          Screening is enabled, but the Vision key or worker secret is missing. Check Showroom Settings.
        </p>
      )}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-[12px] font-semibold text-red-700">{error}</p>}
      {notice && <p role="status" className="flex items-center gap-2 rounded-xl bg-[#F7F3EB] p-3 text-[12px] font-semibold"><CheckCircle2 size={15}/>{notice}</p>}
      {loading && !data.items.length && (
        <div role="status" className="grid gap-3 md:grid-cols-2">
          {[1,2].map(n=><div key={n} className="h-64 animate-pulse rounded-2xl bg-black/5" aria-label="Loading media review queue"/>)}
          <span className="sr-only">Loading media awaiting review…</span>
        </div>
      )}
      {!loading && !error && !data.items.length && (
        <div className="rounded-2xl border border-dashed border-black/20 p-6 text-center">
          <CheckCircle2 size={26} className="mx-auto text-emerald-700"/>
          <p className="mt-2 text-[14px] font-bold">All caught up</p>
          <p className="mt-1 text-[12px] text-black/60">No media needs manual review right now.</p>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {data.items.map(item => {
          const working = busy === item.media_id
          return <article key={item.media_id} className="min-w-0 space-y-3 overflow-hidden rounded-2xl border border-black/15 bg-white p-3 sm:p-4">
            {item.type === 'video' ? (
              <video src={item.url} controls preload="metadata" className="aspect-video w-full rounded-xl bg-black object-contain" aria-label="Video awaiting moderation"/>
            ) : item.type === 'audio' ? (
              <div className="space-y-2 rounded-xl bg-[#F7F3EB] p-4">
                <p className="text-[12px] font-bold">Listen to the full recording before deciding</p>
                <audio src={item.url} controls preload="metadata" className="w-full" aria-label="Audio awaiting moderation"/>
              </div>
            ) : item.type === 'image' ? (
              <img src={cldImage(item.url, { w: 600 })} alt="Flagged photo awaiting review"
                className="aspect-video w-full rounded-xl bg-black/5 object-contain"/>
            ) : <p className="rounded-xl bg-amber-50 p-3 text-[12px] font-semibold">Unknown media type. Inspect the listing before deciding.</p>}
            <div className="space-y-1">
              <p className="break-words text-[14px] font-bold">{item.hat_title}</p>
              <p className="text-[12px] text-black/60">@{item.owner_username} · {item.screening_status === 'held' ? 'On hold' : 'Rejected'}</p>
              <p className="text-[12px] font-semibold text-amber-800">
                Reason: {REASONS[item.screening_reason] || item.screening_reason?.replaceAll('_',' ') || 'Manual review required'}
              </p>
              <a href={`/hat/${item.hat_id}`} target="_blank" rel="noreferrer"
                className="inline-flex min-h-10 items-center text-[12px] font-bold text-[#0A13E6] underline underline-offset-2">
                Inspect full listing
              </a>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button type="button" disabled={Boolean(busy)} onClick={() => decide(item,'approve')}
                className="min-h-11 rounded-xl bg-black px-4 text-[12px] font-bold text-white disabled:opacity-40">
                {working ? 'Updating…' : 'Approve media'}
              </button>
              {item.screening_status === 'held' && item.screening_reason === 'screening_unavailable' && (
                <button type="button" disabled={Boolean(busy)} onClick={() => retry(item)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-700 px-4 text-[12px] font-bold text-amber-900 disabled:opacity-40">
                  <RotateCcw size={14}/>Retry scan
                </button>
              )}
              {item.screening_status !== 'rejected' && (
                <button type="button" disabled={Boolean(busy)} onClick={() => decide(item,'reject')}
                  className="min-h-11 rounded-xl border border-red-700 px-4 text-[12px] font-bold text-red-700 disabled:opacity-40">
                  Reject media
                </button>
              )}
            </div>
          </article>
        })}
      </div>
    </section>
  )
}
