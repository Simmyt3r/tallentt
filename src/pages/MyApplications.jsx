// Path: src/pages/MyApplications.jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import UserIdentity from '../components/UserIdentity'
import { identityFromRow } from '../lib/profile.js'

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

function StatusBadge({ status }) {
  return (
    <span
      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 capitalize ${
        STATUS_STYLE[status] || STATUS_STYLE.withdrawn
      }`}
    >
      {status}
    </span>
  )
}

export default function MyApplications() {
  const { user } = useAuth()
  const [tab, setTab] = useState(() => (user?.role === 'client' ? 'received' : 'sent'))
  const [sent, setSent] = useState([])
  const [received, setReceived] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    Promise.all([
      api.getMyApplications().catch((e) => ({ applications: [], _error: e })),
      api.getReceivedApplications().catch((e) => ({ applications: [], _error: e })),
    ])
      .then(([sentData, receivedData]) => {
        if (cancelled) return
        setSent(sentData.applications || [])
        setReceived(receivedData.applications || [])
        const firstError = sentData._error || receivedData._error
        if (firstError) setError(firstError.message || 'Failed to load applications')
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
    setBusyId(a.application_id)
    const prev = sent
    setSent((list) =>
      list.map((x) => (x.application_id === a.application_id ? { ...x, status: 'withdrawn' } : x)),
    )
    try {
      await api.withdrawApplication(a.hat_id)
    } catch (e) {
      setSent(prev)
      alert(e.message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleRespond(a, status) {
    setBusyId(a.application_id)
    const prev = received
    setReceived((list) =>
      list.map((x) => (x.application_id === a.application_id ? { ...x, status } : x)),
    )
    try {
      await api.respondToApplication(a.hat_id, a.application_id, status)
    } catch (e) {
      setReceived(prev)
      alert(e.message)
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return <p className="text-center text-black/40 py-16 text-[13px] font-medium">Loading applications…</p>
  }

  const active = tab === 'sent' ? sent : received

  return (
    <div className="space-y-5 max-w-[760px] mx-auto">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">My Applications</h1>
        <p className="text-[12px] text-black/50 font-medium mt-0.5">
          Applications you sent and applications received on your Hiring Hats.
        </p>
      </div>

      <div className="inline-flex rounded-full bg-white border-[1.5px] border-black p-1">
        <button
          type="button"
          onClick={() => setTab('sent')}
          className={`h-9 px-4 rounded-full text-[12px] font-semibold transition ${
            tab === 'sent' ? 'bg-[#0A13E6] text-white' : 'text-black/60'
          }`}
        >
          Sent {sent.length > 0 ? `(${sent.length})` : ''}
        </button>
        <button
          type="button"
          onClick={() => setTab('received')}
          className={`h-9 px-4 rounded-full text-[12px] font-semibold transition ${
            tab === 'received' ? 'bg-black text-white' : 'text-black/60'
          }`}
        >
          Received {received.length > 0 ? `(${received.length})` : ''}
        </button>
      </div>

      {error && (
        <div className="rounded-[12px] border-[1.5px] border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-medium text-red-700">
          {error}
        </div>
      )}

      {active.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-[24px] border-[1.5px] border-dashed border-black/20">
          <p className="text-black/50 mb-4 text-[13px] font-medium">
            {tab === 'sent'
              ? "You haven't applied to any Hiring Hats yet."
              : "You haven't received any applications yet."}
          </p>
          {tab === 'sent' ? (
            <Link
              to="/"
              className="inline-flex h-11 px-6 rounded-full bg-[#0A13E6] text-white font-semibold text-[13px] border-[1.5px] border-black items-center"
            >
              Browse the Feed
            </Link>
          ) : (
            <Link
              to="/my-hats"
              className="inline-flex h-11 px-6 rounded-full bg-black text-white font-semibold text-[13px] border-[1.5px] border-black items-center"
            >
              Manage My Hats
            </Link>
          )}
        </div>
      ) : tab === 'sent' ? (
        <ul className="bg-white rounded-[20px] border-[1.5px] border-black divide-y divide-black/10 overflow-hidden">
          {sent.map((a) => (
            <li key={a.application_id} className="flex items-center gap-4 p-4 flex-wrap">
              <div className="w-12 h-12 rounded-[12px] bg-[#F5F3EF] overflow-hidden shrink-0 border-[1.5px] border-black/10">
                {a.hat_thumbnail && <img src={a.hat_thumbnail} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <Link to={`/talent/${a.hat_id}`} className="block font-semibold text-[14px] truncate">
                  {a.hat_title}
                </Link>
                <p className="text-[12px] text-black/50 truncate">
                  <UserIdentity
                    user={identityFromRow(a, 'owner')}
                    layout="inline"
                    showAvatar={false}
                    nameClassName="font-semibold text-black/70"
                    usernameClassName="font-semibold text-black/50"
                  />{' '}
                  · {a.category}
                </p>
                {a.hiring_duration && (
                  <p className="text-[11px] text-black/55 font-semibold mt-0.5">Duration: {a.hiring_duration}</p>
                )}
                <p className="text-[11px] text-black/40 flex items-center gap-1 mt-0.5">
                  <Clock size={11} /> Applied {new Date(a.applied_at).toLocaleDateString()}
                </p>
              </div>
              <span className="text-[13px] font-bold shrink-0">{formatPrice(a)}</span>
              <StatusBadge status={a.status} />
              {['pending', 'accepted'].includes(a.status) && (
                <button
                  type="button"
                  onClick={() => handleWithdraw(a)}
                  disabled={busyId === a.application_id}
                  className="h-8 px-3 rounded-full border-[1.5px] border-black/20 text-black/60 text-[11px] font-semibold shrink-0 hover:border-red-500 hover:text-red-600 transition disabled:opacity-50"
                >
                  Withdraw
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="bg-white rounded-[20px] border-[1.5px] border-black divide-y divide-black/10 overflow-hidden">
          {received.map((a) => (
            <li key={a.application_id} className="flex items-center gap-4 p-4 flex-wrap">
              <div className="w-12 h-12 rounded-full bg-[#F5F3EF] overflow-hidden shrink-0 border-[1.5px] border-black/10">
                {a.applicant_avatar && <img src={a.applicant_avatar} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <Link to={`/talent/${a.hat_id}`} className="block font-semibold text-[14px] truncate">
                  {a.hat_title}
                </Link>
                <p className="text-[12px] text-black/50 truncate">
                  <UserIdentity
                    user={identityFromRow(a, 'applicant')}
                    layout="inline"
                    showAvatar={false}
                    nameClassName="font-semibold text-black/70"
                    usernameClassName="font-semibold text-black/50"
                  />{' '}
                  applied
                </p>
                {a.message && <p className="text-[12px] text-black/60 mt-0.5 break-words">{a.message}</p>}
                {a.hiring_duration && (
                  <p className="text-[11px] text-black/55 font-semibold mt-0.5">Duration: {a.hiring_duration}</p>
                )}
                <p className="text-[11px] text-black/40 flex items-center gap-1 mt-0.5">
                  <Clock size={11} /> Received {new Date(a.applied_at).toLocaleDateString()}
                </p>
              </div>
              <span className="text-[13px] font-bold shrink-0">{formatPrice(a)}</span>
              <StatusBadge status={a.status} />
              {a.status === 'pending' && (
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRespond(a, 'accepted')}
                    disabled={busyId === a.application_id}
                    className="h-8 px-3 rounded-full bg-[#0A13E6] text-white text-[11px] font-semibold disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRespond(a, 'rejected')}
                    disabled={busyId === a.application_id}
                    className="h-8 px-3 rounded-full border-[1.5px] border-black/20 text-black/60 text-[11px] font-semibold hover:border-red-500 hover:text-red-600 transition disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
