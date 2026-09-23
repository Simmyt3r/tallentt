// Path: src/pages/HatPage.jsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import BentoCardDetailModal from '../components/BentoCardDetailModal'
import { bookHat, submitApplication } from '../lib/hatActions'

// The canonical, directly-shareable hat route (see canonicalHatUrl in
// bentoCardShared.jsx: /hat/:hatId, used by every Share action). This
// fetches the hat fresh from the API on every load/refresh — it never
// depends on Feed already having it in memory — and reuses
// BentoCardDetailModal's content rather than a second, separate Hat UI.
// "Closing" here just means leaving the page, since there's no feed
// behind it to reveal: back if there's somewhere to go back to, otherwise
// home. Wrapped in the same ProtectedRoute as every other screen in
// App.jsx, so it follows the app's existing auth rules rather than
// inventing new ones for shared links specifically.
export default function HatPage() {
  const { hatId } = useParams()
  const navigate = useNavigate()
  const [hat, setHat] = useState(null)
  // 'loading' | 'ready' | 'not-found' | 'error'
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setHat(null)
    ;(async () => {
      try {
        const data = await api.getHat(hatId)
        if (!cancelled) {
          setHat(data.hat)
          setStatus('ready')
        }
      } catch (e) {
        if (!cancelled) setStatus(e.status === 404 ? 'not-found' : 'error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hatId])

  function handleClose() {
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }

  function handleHatChange(patch) {
    setHat((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  if (status === 'loading') {
    return (
      <div className="min-h-[60vh] grid place-items-center text-black/40 text-[13px] font-medium">
        Loading…
      </div>
    )
  }

  if (status === 'not-found' || status === 'error') {
    return (
      <div className="min-h-[60vh] grid place-items-center px-4">
        <div className="text-center py-16 px-6 bg-white rounded-[24px] border-[1.5px] border-dashed border-black/20 space-y-3 max-w-sm">
          <p className="text-black/50 text-[13px] font-medium">
            {status === 'not-found' ? 'This hat no longer exists.' : 'Could not load this hat.'}
          </p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="tw-btn-ghost h-9 px-4 text-[12px] inline-flex mx-auto"
          >
            Back to feed
          </button>
        </div>
      </div>
    )
  }

  return (
    <BentoCardDetailModal
      hat={hat}
      onClose={handleClose}
      onBook={(h, proposal) => bookHat(h, navigate, proposal)}
      onApply={(h, proposal) => submitApplication(h, handleHatChange, navigate, proposal)}
      onHatChange={handleHatChange}
    />
  )
}