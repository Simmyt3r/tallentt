import { useCallback, useEffect, useState } from 'react'
import { Activity, RefreshCw, Clock3, PlayCircle, ShieldAlert } from 'lucide-react'
import { api } from '../lib/api.js'

function stamp(value) {
  if (!value) return 'Not yet'
  try { return new Date(value).toLocaleString() }
  catch { return 'Unknown time' }
}

export default function AdminShowroomOps({ enabled, configured }) {
  const [data, setData] = useState({ counts: {}, due: 0, runs: [] })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  const refresh = useCallback(async () => {
    try { setData(await api.getAdminScreeningOps()); setError('') }
    catch (err) { setError(err.message || 'Could not load screening queue health.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function runNow() {
    if (busy) return
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      const result = await api.runAdminShowroomScreening()
      setFeedback(`Checked ${result.checked || 0} media. ${result.passed || 0} passed, ${result.held || 0} held, ${result.retried || 0} scheduled for retry.`)
      await refresh()
    } catch (err) { setError(err.message || 'Screening could not start.') }
    finally { setBusy(false) }
  }

  const counts = data.counts || {}
  return (
    <section aria-label="Moderation worker and queue health" className="space-y-4 rounded-2xl border border-black/15 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-[14px] font-black"><Activity size={17}/> Worker & queue</h4>
          <p className="mt-1 max-w-lg text-[12px] text-black/55">
            Inspect the live screening backlog and run a small batch directly from Admin.
            This does not replace the scheduled worker.
          </p>
        </div>
        <button type="button" onClick={refresh} disabled={busy}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-black px-3 text-[11px] font-bold disabled:opacity-40">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Ready to scan', data.due ?? 0],
          ['Processing', counts.processing || 0],
          ['Held', counts.held || 0],
          ['Rejected', counts.rejected || 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-black/10 bg-[#F7F3EB] p-3">
            <div className="text-[20px] font-black tabular-nums">{loading ? '…' : value}</div>
            <p className="text-[10px] font-bold text-black/55">{label}</p>
          </div>
        ))}
      </div>
      {!enabled && (
        <p className="flex items-center gap-2 text-[11px] font-semibold text-black/55">
          <Clock3 size={14}/> Screening is disabled. Enable it above to process media.
        </p>
      )}
      {enabled && !configured && (
        <p role="alert" className="flex items-center gap-2 text-[11px] font-semibold text-amber-800">
          <ShieldAlert size={14}/> Complete configuration before processing.
        </p>
      )}
      <button type="button" onClick={runNow} disabled={busy || !enabled || !configured}
        className="inline-flex h-11 items-center gap-2 rounded-full bg-black px-5 text-[12px] font-bold text-white disabled:opacity-40">
        <PlayCircle size={17}/> {busy ? 'Processing…' : 'Process next 4 media'}
      </button>
      {error && <p role="alert" className="text-[12px] font-semibold text-red-700">{error}</p>}
      {feedback && <p role="status" className="text-[12px] font-semibold text-emerald-800">{feedback}</p>}
      <div className="space-y-2 border-t border-black/10 pt-3">
        <h5 className="text-[12px] font-black">Recent screening runs</h5>
        {!data.runs?.length && <p className="text-[11px] text-black/45">No run has been recorded yet.</p>}
        {(data.runs || []).map(run => (
          <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 py-2 text-[11px]">
            <div>
              <p className="font-bold">{run.source === 'admin' ? 'Admin run' : 'Scheduled worker'} · {stamp(run.started_at)}</p>
              <p className="text-black/50">{run.checked} checked · {run.passed} passed · {run.held} held · {run.retried} retries</p>
            </div>
            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${run.status === 'failed' ? 'bg-red-50 text-red-700' : run.status === 'running' ? 'bg-amber-50 text-amber-800' : 'bg-[#F7F3EB] text-black/70'}`}>
              {run.status === 'failed' ? 'Failed' : run.status === 'running' ? 'Running' : 'Completed'}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
