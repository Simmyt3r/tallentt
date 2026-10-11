import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Copy, KeyRound, RefreshCw, Save, ShieldAlert } from 'lucide-react'
import { api } from '../lib/api.js'
import AdminShowroomOps from './AdminShowroomOps.jsx'
import AdminShowroomPreflight from './AdminShowroomPreflight.jsx'

export default function AdminShowroomConfig() {
  const [status, setStatus] = useState(null)
  const [cloudName, setCloudName] = useState('')
  const [visionKey, setVisionKey] = useState('')
  const [workerSecret, setWorkerSecret] = useState('')
  const [workerSecretOnce, setWorkerSecretOnce] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [visionHealth, setVisionHealth] = useState(null)

  const refresh = useCallback(async () => {
    setBusy('load')
    setError('')
    try {
      const data = await api.getAdminScreeningConfig()
      setStatus(data)
      setCloudName(data.cloudName || '')
    } catch (err) {
      setError(err.message || 'Could not read screening settings.')
    } finally { setBusy('') }
  }, [])
  useEffect(() => { refresh() }, [refresh])

  async function save(settings) {
    if (busy) return
    setBusy('save')
    setError('')
    setNotice('')
    try {
      const data = await api.saveAdminScreeningConfig(settings)
      setStatus(data)
      setCloudName(data.cloudName || '')
      setVisionKey('')
      setWorkerSecret('')
      setVisionHealth(null)
      setNotice('Settings saved securely. Future media submissions will use these values.')
    } catch (err) { setError(err.message || 'Could not save screening configuration.') }
    finally { setBusy('') }
  }

  async function testVision() {
    if (busy) return
    setBusy('vision')
    setError('')
    setVisionHealth(null)
    try {
      const response = await api.testAdminShowroomVision()
      setVisionHealth(response)
      setNotice('Google Cloud Vision accepted a test request. This verifies current connectivity and permissions.')
    } catch (err) { setError(err.message || 'Cloud Vision connectivity test failed.') }
    finally { setBusy('') }
  }

  async function generateSecret() {
    if (busy) return
    if (status?.workerConfigured &&
        !window.confirm('Replace the worker secret? Your scheduled worker must use the new secret immediately or jobs will stop.')) return
    setBusy('generate')
    setError('')
    setNotice('')
    try {
      const data = await api.generateAdminScreeningWorkerSecret()
      setStatus(data)
      setWorkerSecretOnce(data.workerSecretOnce || '')
      setWorkerSecret('')
      setNotice('A new worker secret was saved. Copy it now and update the GitHub Actions secret.')
    } catch (err) { setError(err.message || 'Could not generate a secret.') }
    finally { setBusy('') }
  }

  async function copySecret() {
    try { await navigator.clipboard.writeText(workerSecretOnce); setNotice('Worker secret copied. Update the GitHub Actions repository secret.') }
    catch { setError('Clipboard unavailable. Select and copy the secret manually.') }
  }

  function handleSave(event) {
    event.preventDefault()
    const payload = {}
    if (cloudName.trim() && cloudName.trim() !== status?.cloudName) payload.cloudName = cloudName.trim()
    if (visionKey.trim()) payload.visionKey = visionKey.trim()
    if (workerSecret.trim()) payload.workerSecret = workerSecret.trim()
    if (!Object.keys(payload).length) { setNotice('No new settings to save.'); return }
    save(payload)
  }

  const working = Boolean(busy)
  return (
    <section aria-label="Showroom screening configuration" className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-black">Automated Showroom screening</h3>
          <p className="mt-1 max-w-xl text-[12px] text-black/60">
            Configure media screening directly in Admin. API keys and worker secrets are encrypted on the server
            and are never returned when reopening this page.
          </p>
        </div>
        <button type="button" onClick={refresh} disabled={working}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-black px-4 text-[11px] font-bold disabled:opacity-40">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] font-bold text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-black/10 bg-[#F7F3EB] p-3 text-[12px] font-semibold">{notice}</p>}

      <div className="grid gap-2 sm:grid-cols-3">
        {[
          ['Cloudinary', status?.cloudConfigured],
          ['Google Vision', status?.visionConfigured],
          ['Worker secret', status?.workerConfigured],
        ].map(([name, ok]) => (
          <div key={name} className="flex items-center gap-2 rounded-xl border border-black/10 bg-[#F7F3EB] p-3 text-[11px] font-bold">
            {ok ? <CheckCircle2 size={15} className="text-emerald-700" /> : <ShieldAlert size={15} className="text-amber-700" />}
            {name}: {ok ? 'Configured' : 'Missing'}
          </div>
        ))}
      </div>

      <form className="space-y-4" onSubmit={handleSave}>
        <div className="space-y-1.5">
          <label htmlFor="showroom-cloud" className="block text-[11px] font-black">CLOUDINARY_CLOUD_NAME</label>
          <input id="showroom-cloud" autoComplete="off" value={cloudName}
            onChange={e => setCloudName(e.target.value)} placeholder="Your Cloudinary cloud name"
            className="h-11 w-full rounded-xl border border-black/20 bg-white px-3 text-[12px] outline-none focus:border-black" />
          <p className="text-[11px] text-black/50">Must match the Cloudinary account used to upload Hat media.</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="showroom-vision" className="block text-[11px] font-black">GOOGLE_CLOUD_VISION_API_KEY</label>
          <input id="showroom-vision" type="password" autoComplete="new-password"
            value={visionKey} onChange={e => setVisionKey(e.target.value)}
            placeholder={status?.visionConfigured ? 'Configured and encrypted · Enter only to replace' : 'Enter a Cloud Vision API key'}
            className="h-11 w-full rounded-xl border border-black/20 bg-white px-3 text-[12px] outline-none focus:border-black" />
          <p className="text-[11px] text-black/50">Server-side key, never displayed again. Restrict it to the required Google Cloud APIs.</p>
          <button type="button" onClick={testVision} disabled={working || !status?.visionConfigured}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-black px-4 text-[11px] font-bold disabled:opacity-40">
            {busy === 'vision' ? 'Testing connection…' : 'Test Cloud Vision connection'}
          </button>
          {visionHealth?.ok && <p role="status" className="text-[11px] font-bold text-emerald-800">Vision API responded successfully at {new Date(visionHealth.validatedAt).toLocaleString()}.</p>}
          <p className="text-[10px] text-black/45">The test submits a synthetic image and may count against your API quota. Save a new key before testing it.</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="showroom-worker" className="block text-[11px] font-black">SHOWROOM_WORKER_SECRET</label>
          <input id="showroom-worker" type="password" autoComplete="new-password"
            value={workerSecret} onChange={e => setWorkerSecret(e.target.value)}
            placeholder={status?.workerConfigured ? 'Configured and encrypted · Enter only to replace' : 'Paste a 24+ character worker secret'}
            className="h-11 w-full rounded-xl border border-black/20 bg-white px-3 text-[12px] outline-none focus:border-black" />
          <button type="button" onClick={generateSecret} disabled={working}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-black px-4 text-[11px] font-bold disabled:opacity-50">
            <KeyRound size={14} /> {busy === 'generate' ? 'Generating…' : status?.workerConfigured ? 'Rotate worker secret' : 'Generate secure secret'}
          </button>
          {workerSecretOnce && (
            <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p className="text-[11px] font-semibold text-amber-900">Shown once. Copy this into the GitHub Actions secret SHOWROOM_WORKER_SECRET.</p>
              <div className="flex gap-2">
                <input aria-label="New worker secret" readOnly value={workerSecretOnce}
                  className="h-10 min-w-0 flex-1 rounded-lg border border-amber-200 bg-white px-2 text-[11px] font-mono" />
                <button type="button" onClick={copySecret}
                  className="inline-flex h-10 items-center gap-1 rounded-lg bg-black px-3 text-[11px] text-white"><Copy size={13} /> Copy</button>
              </div>
              <button type="button" onClick={() => setWorkerSecretOnce('')}
                className="text-[11px] font-bold underline">Hide secret</button>
            </div>
          )}
        </div>
        <button type="submit" disabled={working || !status}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0A13E6] px-5 text-[12px] font-bold text-white disabled:opacity-50">
          <Save size={15} /> {busy === 'save' ? 'Saving…' : 'Save screening credentials'}
        </button>
      </form>

      <div className="rounded-2xl border border-black/15 p-4 space-y-3">
        <div>
          <h4 className="text-[14px] font-black">SHOWROOM_MEDIA_SCREENING</h4>
          <p className="text-[12px] text-black/60">Enable enforcement after the worker is configured and the database migration is applied.
            Until then, legacy admission remains active.</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[12px] font-bold">{status?.enabled ? 'Enforced: new media waits for automated screening' : 'Off: existing admission rules apply'}</span>
          <button type="button" disabled={working || !status || (!status?.enabled && !status?.ready)}
            onClick={() => {
              if (!status?.enabled && !window.confirm('Enable screening? New media will wait for the screening worker before entering Showroom.')) return
              save({ enabled: !status.enabled })
            }}
            className={`h-11 rounded-full px-5 text-[12px] font-bold disabled:opacity-40 ${status?.enabled ? 'border border-black bg-white text-black' : 'bg-black text-white'}`}>
            {status?.enabled ? 'Disable screening' : 'Enable screening'}
          </button>
        </div>
        {!status?.ready && <p className="text-[11px] font-semibold text-amber-800">
          All three credentials must be configured before enforcement can be activated.
        </p>}
      </div>

      <section aria-label="Signed Hat upload rollout" className="rounded-2xl border border-black/15 p-4 space-y-2">
        <h4 className="text-[14px] font-black">Signed Hat uploads</h4>
        <p className="text-[12px] text-black/60">Protects portfolios from forged media links by requiring server-issued Cloudinary uploads and verifying each asset before publication.</p>
        <div className="flex flex-wrap gap-2 text-[11px] font-bold">
          <span className="rounded-full bg-[#F7F3EB] px-3 py-2">
            Policy: {status?.signedUploadStatus?.enabled ? 'Enforced' : 'Legacy mode'}
          </span>
          <span className="rounded-full bg-[#F7F3EB] px-3 py-2">
            Server keys: {status?.signedUploadStatus?.credentialsConfigured ? 'Ready' : 'Missing'}
          </span>
          <span className="rounded-full bg-[#F7F3EB] px-3 py-2">
            DB migration: {status?.signedUploadStatus?.migrationInstalled ? 'Applied' : 'Pending'}
          </span>
        </div>
        <p className="text-[11px] text-black/55">
          Enable with the server-side HAT_MEDIA_SIGNED_UPLOADS=enforce only after
          confirming the Cloudinary API credentials and applying the migration.
          The Cloudinary API secret must remain on the server, not in Admin or browser code.
        </p>
      </section>
      <AdminShowroomPreflight />
      <AdminShowroomOps enabled={Boolean(status?.enabled)} configured={Boolean(status?.ready)} />

      <p className="text-[11px] text-black/55">
        One-time server setup is still required for the encryption root (JWT_SECRET or SHOWROOM_CONFIG_ENCRYPTION_KEY).
        The scheduled GitHub worker also requires the matching repository secret and must be enabled separately.
        Saving a Cloud Vision key confirms its format, not that billing or API access is activated.
      </p>
    </section>
  )
}
