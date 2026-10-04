import { useCallback, useEffect, useMemo, useState } from 'react'
import { BellRing, CheckCircle2, ShieldCheck, Smartphone, XCircle } from 'lucide-react'
import { api } from '../lib/api.js'
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushState,
  getPushSupport,
} from '../lib/pushNotifications.js'

const OPTIONS = [
  ['deals', 'Deals', 'Bookings, applications, delivery and dispute updates.'],
  ['negotiations', 'Negotiations', 'New offers, counteroffers and agreement updates.'],
  ['messages', 'Deals Chat', 'New deal messages while you are away.'],
  ['payments', 'Payments', 'Wallet and escrow reminders. Critical money alerts always stay enabled.'],
  ['live', 'Live', 'Live-session and support activity.'],
  ['marketing', 'Marketing', 'Product announcements and promotional updates.'],
]

export default function PushNotificationSettings() {
  const support = useMemo(() => getPushSupport(), [])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [config, setConfig] = useState(null)
  const [state, setState] = useState({
    supported: support.supported,
    permission: support.permission,
    subscribed: false,
  })
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [nextConfig, nextState] = await Promise.all([
        api.getPushConfig(),
        getPushState(),
      ])
      setConfig(nextConfig)
      setState(nextState)
      setError('')
    } catch (err) {
      setError(err.message || 'Could not load push notification settings.')
      setState(await getPushState())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function turnOn() {
    setBusy(true)
    setError('')
    try {
      await enablePushNotifications()
      await load()
    } catch (err) {
      setError(err.message || 'Could not enable push notifications.')
      setState(await getPushState())
    } finally {
      setBusy(false)
    }
  }

  async function turnOff() {
    setBusy(true)
    setError('')
    try {
      await disablePushNotifications()
      await load()
    } catch (err) {
      setError(err.message || 'Could not disable push notifications.')
    } finally {
      setBusy(false)
    }
  }

  async function changePreference(key, value) {
    if (!config?.preferences) return
    const optimistic = { ...config.preferences, [key]: value }
    setConfig((current) => ({ ...current, preferences: optimistic }))
    try {
      const result = await api.updatePushPreferences({ [key]: value })
      setConfig((current) => ({ ...current, preferences: result.preferences }))
    } catch (err) {
      setConfig((current) => ({ ...current, preferences: config.preferences }))
      setError(err.message || 'Could not update notification preferences.')
    }
  }

  const ios = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)
  const permissionBlocked = state.permission === 'denied'
  const serverReady = config?.configured === true

  return (
    <section className="mb-5 overflow-hidden rounded-[22px] border-[1.5px] border-black bg-white" aria-label="Push notification settings">
      <div className="border-b border-black/10 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-[#0A13E6]/15 bg-[#EEF0FF] text-[#0A13E6]">
              <BellRing size={19} />
            </span>
            <div>
              <h2 className="text-[15px] font-black">Push notifications</h2>
              <p className="mt-1 max-w-xl text-[11.5px] leading-relaxed text-black/50">
                Get important ChombuTar updates when the app is closed. Permission is requested only when you enable this device.
              </p>
            </div>
          </div>

          {!loading && state.supported && serverReady && (
            state.subscribed ? (
              <button
                type="button"
                onClick={turnOff}
                disabled={busy}
                className="h-9 rounded-full border-[1.5px] border-black bg-white px-4 text-[11px] font-black disabled:opacity-50"
              >
                {busy ? 'Updating…' : 'Turn off on this device'}
              </button>
            ) : (
              <button
                type="button"
                onClick={turnOn}
                disabled={busy || permissionBlocked}
                className="h-9 rounded-full bg-[#0A13E6] px-4 text-[11px] font-black text-white disabled:opacity-45"
              >
                {busy ? 'Enabling…' : permissionBlocked ? 'Blocked by browser' : 'Enable on this device'}
              </button>
            )
          )}
        </div>

        {!loading && (
          <div className="mt-3 flex flex-wrap gap-2 text-[10.5px] font-bold">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${state.subscribed ? 'bg-emerald-50 text-emerald-700' : 'bg-[#F5F3EF] text-black/55'}`}>
              {state.subscribed ? <CheckCircle2 size={13} /> : <Smartphone size={13} />}
              {state.subscribed ? 'This device is subscribed' : 'This device is not subscribed'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F5F3EF] px-2.5 py-1 text-black/55">
              <ShieldCheck size={13} /> Critical escrow/payment alerts protected
            </span>
          </div>
        )}

        {!loading && !state.supported && (
          <p className="mt-3 rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">
            {ios
              ? 'On iPhone/iPad, install ChombuTar to your Home Screen first, then enable notifications from the installed app.'
              : 'This browser does not support Web Push notifications.'}
          </p>
        )}
        {!loading && state.supported && !serverReady && !error && (
          <p className="mt-3 rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">
            Push delivery is not configured on the server yet.
          </p>
        )}
        {permissionBlocked && (
          <p className="mt-3 rounded-[12px] border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700">
            <span className="inline-flex items-center gap-1.5"><XCircle size={13} /> Notifications are blocked for this site. Re-enable them in your browser/site settings.</span>
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 rounded-[12px] border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700">
            {error}
          </p>
        )}
      </div>

      {config?.preferences && (
        <div className="divide-y divide-black/10">
          {OPTIONS.map(([key, label, description]) => (
            <label key={key} className="flex cursor-pointer items-start gap-3 px-4 py-3.5 sm:px-5">
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-black">{label}</span>
                <span className="mt-0.5 block text-[10.5px] leading-relaxed text-black/45">{description}</span>
              </span>
              <input
                type="checkbox"
                checked={Boolean(config.preferences[key])}
                onChange={(event) => changePreference(key, event.target.checked)}
                className="mt-1 h-4 w-4 accent-[#0A13E6]"
              />
            </label>
          ))}
        </div>
      )}
    </section>
  )
}
