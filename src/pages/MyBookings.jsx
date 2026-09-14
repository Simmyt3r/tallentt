// Path: src/pages/MyBookings.jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { api, payWithPaystack } from '../lib/api'
import { useAuth } from '../context/AuthContext'

// Co-located per the codebase's existing pattern (see BentoCard.jsx,
// TalentProfile.jsx) rather than pulled into a shared helper.
function fmtMoney(n, currency = 'NGN') {
  if (n == null) return null
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
  } catch {
    return `₦${Number(n).toLocaleString()}`
  }
}

const STATUS_STYLE = {
  not_funded: 'bg-[#FFF6DB] text-[#8A6D00]',
  secured: 'bg-[#E8FFE6] text-[#0A7A00]',
  released: 'bg-[#EDEBFF] text-[#3B2FD9]',
  cancelled: 'bg-red-50 text-red-600',
}

const STATUS_LABEL = {
  not_funded: 'Awaiting payment',
  secured: 'Secured',
  released: 'Released',
  cancelled: 'Cancelled',
}

// "My Bookings" — hats the signed-in user has booked as a client, backed
// by the existing escrows table/system (no separate bookings table — see
// api/hats/[id].js's has_booked comment). Reads from
// GET /api/escrows?mine=1 (see api/escrows/index.js).
export default function MyBookings() {
  const { user, refreshUser } = useAuth()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    let cancelled = false
    api
      .getMyBookings()
      .then((data) => {
        if (!cancelled) setBookings(data.bookings || [])
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Failed to load your bookings')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleFund(b) {
    setBusyId(b.id)
    try {
      const reference = await payWithPaystack({
        email: user.email,
        amountNaira: b.amount,
        metadata: { escrow_id: b.id, hat_id: b.hat_id },
      })
      const { escrow } = await api.fundEscrow(b.id, reference)
      setBookings((list) => list.map((x) => (x.id === b.id ? { ...x, ...escrow } : x)))
    } catch (e) {
      alert(e.message)
    } finally {
      setBusyId(null)
    }
  }

  // Pays straight out of the wallet balance — only ever shown when
  // user.walletBalance already covers the amount, so no confirm() dialog
  // (the button itself, next to the card-payment fallback, is the choice).
  async function handleFundWallet(b) {
    setBusyId(b.id)
    try {
      const { escrow } = await api.fundEscrowWithWallet(b.id)
      setBookings((list) => list.map((x) => (x.id === b.id ? { ...x, ...escrow } : x)))
      await refreshUser()
    } catch (e) {
      alert(e.message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleRelease(b) {
    if (!confirm(`Release payment for "${b.hat_title}" into ${b.talent_full_name || b.talent_username}'s wallet? This can't be undone.`))
      return
    setBusyId(b.id)
    const prev = bookings
    setBookings((list) => list.map((x) => (x.id === b.id ? { ...x, status: 'released' } : x)))
    try {
      await api.releaseEscrow(b.id)
    } catch (e) {
      setBookings(prev)
      alert(e.message)
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return <p className="text-center text-black/40 py-16 text-[13px] font-medium">Loading your bookings…</p>
  }

  return (
    <div className="space-y-5 max-w-[720px] mx-auto">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">My Bookings</h1>
        <p className="text-[12px] text-black/50 font-medium mt-0.5">
          {bookings.length} booking{bookings.length !== 1 ? 's' : ''}
        </p>
      </div>

      {error && (
        <div className="rounded-[12px] border-[1.5px] border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-medium text-red-700">
          {error}
        </div>
      )}

      {bookings.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-[24px] border-[1.5px] border-dashed border-black/20">
          <p className="text-black/50 mb-4 text-[13px] font-medium">You haven't booked any talent yet.</p>
          <Link
            to="/"
            className="inline-flex h-11 px-6 rounded-full bg-[#0A13E6] text-white font-semibold text-[13px] border-[1.5px] border-black items-center"
          >
            Browse the Feed
          </Link>
        </div>
      ) : (
        <ul className="bg-white rounded-[20px] border-[1.5px] border-black divide-y divide-black/10 overflow-hidden">
          {bookings.map((b) => {
            const canUseWallet = (user?.walletBalance || 0) >= b.amount
            return (
              <li key={b.id} className="flex items-center gap-4 p-4 flex-wrap">
                <div className="w-12 h-12 rounded-[12px] bg-[#F5F3EF] overflow-hidden shrink-0 border-[1.5px] border-black/10">
                  {b.hat_thumbnail && <img src={b.hat_thumbnail} alt="" className="w-full h-full object-cover" />}
                </div>
                <Link to={`/talent/${b.hat_id}`} className="min-w-0 flex-1">
                  <p className="font-semibold text-[14px] truncate">{b.hat_title}</p>
                  <p className="text-[12px] text-black/50 truncate">
                    {b.talent_full_name || b.talent_username} · {b.category}
                  </p>
                  <p className="text-[11px] text-black/40 flex items-center gap-1 mt-0.5">
                    <Clock size={11} /> Booked {new Date(b.created_at).toLocaleDateString()}
                  </p>
                </Link>
                <span className="text-[13px] font-bold shrink-0">{fmtMoney(b.amount, b.currency)}</span>
                <span
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${STATUS_STYLE[b.status] || STATUS_STYLE.cancelled}`}
                >
                  {STATUS_LABEL[b.status] || b.status}
                </span>
                {b.status === 'not_funded' && (
                  <div className="flex gap-2 shrink-0">
                    {canUseWallet && (
                      <button
                        type="button"
                        onClick={() => handleFundWallet(b)}
                        disabled={busyId === b.id}
                        className="h-8 px-3 rounded-full bg-[#0A13E6] text-white text-[11px] font-semibold disabled:opacity-50"
                      >
                        Pay from wallet
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleFund(b)}
                      disabled={busyId === b.id}
                      className={
                        canUseWallet
                          ? 'h-8 px-3 rounded-full border-[1.5px] border-black/20 text-black/60 text-[11px] font-semibold hover:border-black hover:text-black transition disabled:opacity-50'
                          : 'h-8 px-3 rounded-full bg-[#0A13E6] text-white text-[11px] font-semibold disabled:opacity-50'
                      }
                    >
                      {canUseWallet ? 'Pay with card' : 'Fund escrow'}
                    </button>
                  </div>
                )}
                {b.status === 'secured' && (
                  <button
                    type="button"
                    onClick={() => handleRelease(b)}
                    disabled={busyId === b.id}
                    className="h-8 px-3 rounded-full border-[1.5px] border-black/20 text-black/60 text-[11px] font-semibold shrink-0 hover:border-black hover:text-black transition disabled:opacity-50"
                  >
                    Release payment
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}