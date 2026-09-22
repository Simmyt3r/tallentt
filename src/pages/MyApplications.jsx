// Path: src/pages/MyApplications.jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { api } from '../lib/api'
import UserIdentity from '../components/UserIdentity'
import { identityFromRow } from '../lib/profile.js'

// Mirrors the pricing display logic used in BentoCard.jsx / TalentProfile.jsx.
// Co-located here rather than shared, per the codebase's existing pattern.
function fmtMoney(n, currency = 'NGN') {
  if (n == null) return null
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
  } catch {
    return `₦${Number(n).toLocaleString()}`
  }
}

function formatPrice(a) {
  const currency = a.currency || 'NGN'
  if (a.price_type === 'range' && a.price_min != null) {
    const min = fmtMoney(a.price_min, currency)
    const max = fmtMoney(a.price_max, currency)
    return max && a.price_max !== a.price_min ? `${min} – ${max}` : min
  }
  if (a.rate != null) {
    const unit = a.rate_unit === 'custom' ? a.rate_unit_custom : a.rate_unit ? `/${a.rate_unit}` : ''
    const base = `${fmtMoney(a.rate, currency)}${unit ? ` ${unit}` : ''}`
    return a.price_negotiable ? `${base} · Range` : base
  }
  return '—'
}

const STATUS_STYLE = {
  pending: 'bg-[#FFF6DB] text-[#8A6D00]',
  accepted: 'bg-[#E8FFE6] text-[#0A7A00]',
  rejected: 'bg-red-50 text-red-600',
  withdrawn: 'bg-[#F5F3EF] text-black/50',
}

// "My Applications" — the talent-side counterpart to MyHats.jsx's
// ApplicantsPanel. That component shows who applied to *your* hats; this
// page shows the hats *you've* applied to as a talent. Reads from
// GET /api/hats?applied=1 (see api/hats/index.js).
export default function MyApplications() {
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [withdrawingId, setWithdrawingId] = useState(null)

  useEffect(() => {
    let cancelled = false
    api
      .getMyApplications()
      .then((data) => {
        if (!cancelled) setApplications(data.applications || [])
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Failed to load your applications')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleWithdraw(a) {
    if (!confirm(`Withdraw your application for "${a.hat_title}"?`)) return
    setWithdrawingId(a.application_id)
    const prev = applications
    setApplications((list) =>
      list.map((x) => (x.application_id === a.application_id ? { ...x, status: 'withdrawn' } : x)),
    )
    try {
      await api.withdrawApplication(a.hat_id)
    } catch (e) {
      setApplications(prev)
      alert(e.message)
    } finally {
      setWithdrawingId(null)
    }
  }

  if (loading) {
    return <p className="text-center text-black/40 py-16 text-[13px] font-medium">Loading your applications…</p>
  }

  return (
    <div className="space-y-5 max-w-[720px] mx-auto">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">My Applications</h1>
        <p className="text-[12px] text-black/50 font-medium mt-0.5">
          {applications.length} application{applications.length !== 1 ? 's' : ''}
        </p>
      </div>

      {error && (
        <div className="rounded-[12px] border-[1.5px] border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-medium text-red-700">
          {error}
        </div>
      )}

      {applications.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-[24px] border-[1.5px] border-dashed border-black/20">
          <p className="text-black/50 mb-4 text-[13px] font-medium">You haven't applied to any hats yet.</p>
          <Link
            to="/"
            className="inline-flex h-11 px-6 rounded-full bg-[#0A13E6] text-white font-semibold text-[13px] border-[1.5px] border-black items-center"
          >
            Browse the Feed
          </Link>
        </div>
      ) : (
        <ul className="bg-white rounded-[20px] border-[1.5px] border-black divide-y divide-black/10 overflow-hidden">
          {applications.map((a) => (
            <li key={a.application_id} className="flex items-center gap-4 p-4">
              <div className="w-12 h-12 rounded-[12px] bg-[#F5F3EF] overflow-hidden shrink-0 border-[1.5px] border-black/10">
                {a.hat_thumbnail && <img src={a.hat_thumbnail} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <Link to={`/talent/${a.hat_id}`} className="block font-semibold text-[14px] truncate">
                  {a.hat_title}
                </Link>
                <p className="text-[12px] text-black/50 truncate">
                  <UserIdentity user={identityFromRow(a, 'owner')} layout="inline" showAvatar={false} nameClassName="font-semibold text-black/70" usernameClassName="font-semibold text-black/50" /> · {a.category}
                </p>
                <p className="text-[11px] text-black/40 flex items-center gap-1 mt-0.5">
                  <Clock size={11} /> Applied {new Date(a.applied_at).toLocaleDateString()}
                </p>
              </div>
              <span className="text-[13px] font-bold shrink-0">{formatPrice(a)}</span>
              <span
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 capitalize ${STATUS_STYLE[a.status] || STATUS_STYLE.withdrawn}`}
              >
                {a.status}
              </span>
              {['pending', 'accepted'].includes(a.status) && (
                <button
                  type="button"
                  onClick={() => handleWithdraw(a)}
                  disabled={withdrawingId === a.application_id}
                  className="h-8 px-3 rounded-full border-[1.5px] border-black/20 text-black/60 text-[11px] font-semibold shrink-0 hover:border-red-500 hover:text-red-600 transition disabled:opacity-50"
                >
                  Withdraw
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}