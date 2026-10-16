import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Database, RefreshCw, ShieldCheck } from 'lucide-react'
import { api } from '../lib/api.js'

const readableTime = value => {
  if (!value) return 'Not recorded'
  try { return new Date(value).toLocaleString() } catch { return String(value) }
}

export default function AdminMigrations() {
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [chosen, setChosen] = useState(null)
  const [confirmation, setConfirmation] = useState('')

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const data = await api.getAdminMigrations()
      setCatalog(data.migrations || [])
    } catch (err) {
      setError(err.message || 'Could not check the migration status.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  async function applyMigration(item) {
    if (busy || confirmation !== `APPLY ${item.id}`) return
    setBusy(item.id)
    setError('')
    setSuccess('')
    try {
      const result = await api.applyAdminMigration(item.id, item.checksum)
      setSuccess(result.status === 'already_applied'
        ? `${item.title} was already applied. No SQL was rerun.`
        : `${item.title} applied successfully. The result was saved in the database audit log.`)
      setChosen(null)
      setConfirmation('')
      await refresh()
    } catch (err) {
      setError(err.message || 'Migration could not be applied.')
    } finally {
      setBusy('')
    }
  }

  return <div className="space-y-4 p-3.5 md:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2"><Database size={19} />
          <h3 className="text-[15px] font-black">Database migrations</h3>
        </div>
        <p className="mt-1 max-w-xl text-[12px] text-black/60">
          Apply approved database patches from this deployment. This panel cannot run pasted SQL or uploaded scripts.
        </p>
      </div>
      <button type="button" onClick={refresh} disabled={loading || Boolean(busy)}
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-black/20 px-4 text-[12px] font-semibold disabled:opacity-40">
        <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/> Refresh
      </button>
    </div>

    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900">
      <div className="flex items-center gap-2 font-black"><AlertTriangle size={17}/> Before applying to production</div>
      <p className="mt-1">
        Back up your database and confirm you are in the correct environment.
        Scripts change the configured PostgreSQL database directly. Migrations are not a replacement for a backup.
      </p>
    </div>

    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">{error}</p>}
    {success && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[12px] text-emerald-900">{success}</p>}
    {loading && !catalog.length && <p role="status" className="py-6 text-center text-[12px] text-black/50">Checking database migration status…</p>}

    {catalog.map(item => {
      const pending = item.status === 'pending'
      const changed = item.status === 'changed'
      const selected = chosen === item.id
      return <section key={item.id} className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-[13px] font-black">{item.title}</h4>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                changed ? 'bg-red-50 text-red-700'
                : pending ? 'bg-amber-50 text-amber-800'
                : 'bg-emerald-50 text-emerald-800'
              }`}>
                {changed ? 'SQL changed: blocked' : pending ? 'Not recorded' : 'Applied'}
              </span>
            </div>
            <p className="text-[12px] text-black/60">{item.description}</p>
            <p className="break-all font-mono text-[10px] text-black/45">ID: {item.id}</p>
            <p className="font-mono text-[10px] text-black/45">SHA-256: {item.checksum.slice(0, 16)}…</p>
            {item.appliedAt && <p className="text-[11px] text-black/55">
              Applied: {readableTime(item.appliedAt)}
            </p>}
          </div>
          {item.status === 'applied'
            ? <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700">
                <CheckCircle2 size={16}/> Installed
              </span>
            : <button type="button"
                disabled={changed || Boolean(busy) || loading}
                onClick={() => { setChosen(selected ? null : item.id); setConfirmation(''); setError(''); setSuccess('') }}
                className="min-h-10 rounded-full bg-[#0A13E6] px-4 text-[12px] font-bold text-white disabled:opacity-40">
                {selected ? 'Cancel' : 'Review & apply'}
              </button>}
        </div>
        {changed && <p className="mt-2 text-[12px] text-red-700">
          An earlier version of this migration is recorded. Do not rerun it without a reviewed follow-up migration.
        </p>}
        {selected && pending && <div className="mt-4 space-y-3 border-t border-black/10 pt-3">
          <p className="flex items-center gap-2 text-[12px] text-black/70">
            <ShieldCheck size={17}/> Only the selected, bundled migration will run inside a database transaction.
          </p>
          <label className="block text-[12px] font-semibold" htmlFor={`migration-confirm-${item.id}`}>
            Type <code className="select-all font-mono">APPLY {item.id}</code> to confirm
          </label>
          <input id={`migration-confirm-${item.id}`} value={confirmation}
            onChange={e=>setConfirmation(e.target.value)} autoComplete="off"
            placeholder="Enter the confirmation phrase" spellCheck={false}
            className="h-11 w-full rounded-xl border border-black/20 px-3 font-mono text-[12px] outline-none focus:border-[#0A13E6]"/>
          <button type="button" disabled={Boolean(busy) || loading || confirmation !== `APPLY ${item.id}`}
            onClick={() => applyMigration(item)}
            className="min-h-11 rounded-full bg-[#0A13E6] px-5 text-[12px] font-black text-white disabled:opacity-40">
            {busy === item.id ? 'Applying migration…' : 'Apply this migration'}
          </button>
        </div>}
      </section>
    })}

    {!loading && !catalog.length && !error &&
      <p className="rounded-xl bg-[#F7F3EB] p-4 text-[12px] text-black/60">No approved migrations are bundled in this version.</p>}
    <p className="text-[11px] text-black/45">
      “Not recorded” means this app has no migration-history entry. A patch previously run manually may still show here.
      These approved patches are idempotent; applying them records their checksum and Admin identity.
    </p>
  </div>
}
