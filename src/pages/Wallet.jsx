// Path: src/pages/Wallet.jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownToLine, ArrowUpFromLine, Landmark, Wallet as WalletIcon } from 'lucide-react'
import { api, payWithPaystack } from '../lib/api'
import { useAuth } from '../context/AuthContext'

// Co-located per the codebase's existing pattern (see MyBookings.jsx,
// TalentProfile.jsx) rather than pulled into a shared helper.
function fmtMoney(n) {
  if (n == null) return '₦0'
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n)
  } catch {
    return `₦${Number(n).toLocaleString()}`
  }
}

const TYPE_LABEL = {
  topup: 'Wallet top-up',
  escrow_fund: 'Booking payment',
  escrow_release: 'Booking earnings',
  withdrawal: 'Withdrawal',
  refund: 'Withdrawal refund',
}

const STATUS_STYLE = {
  success: 'bg-[#E8FFE6] text-[#0A7A00]',
  pending: 'bg-[#FFF6DB] text-[#8A6D00]',
  failed: 'bg-red-50 text-red-600',
}

// Direction is implied by `type`, mirroring api/_lib/wallet.js — topup,
// escrow_release, and refund credit the wallet; escrow_fund and
// withdrawal debit it.
const CREDIT_TYPES = new Set(['topup', 'escrow_release', 'refund'])

export default function Wallet() {
  const { user, refreshUser } = useAuth()
  const [balance, setBalance] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .getWallet()
      .then((data) => {
        if (cancelled) return
        setBalance(data.wallet.balance)
        setTransactions(data.wallet.transactions || [])
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Failed to load your wallet')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function reload() {
    const data = await api.getWallet()
    setBalance(data.wallet.balance)
    setTransactions(data.wallet.transactions || [])
    await refreshUser()
  }

  async function handleTopup() {
    const input = prompt('How much would you like to add to your wallet (₦)?')
    if (!input) return
    const amount = Number(input)
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Enter a valid amount.')
      return
    }
    setBusy(true)
    try {
      const reference = await payWithPaystack({
        email: user.email,
        amountNaira: amount,
        // intended_amount travels with the transaction to Paystack and
        // back — the server credits this, not whatever the charge ends
        // up being after Paystack's own fees (see wallet.js).
        metadata: { wallet_topup: true, user_id: user.id, intended_amount: amount },
      })
      const result = await api.topupWallet(reference)
      await reload()
      alert(
        result.serviceFee
          ? `₦${result.amount.toLocaleString()} added to your wallet (₦${result.serviceFee.toLocaleString()} service fee on your ₦${result.grossAmount.toLocaleString()} top-up).`
          : 'Wallet topped up!',
      )
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleWithdraw() {
    if (!user.payoutReady) {
      alert("Add your payout bank account in your profile first — that's where withdrawals get sent.")
      return
    }
    const input = prompt(`How much would you like to withdraw (₦)? Balance: ${fmtMoney(balance)}`)
    if (!input) return
    const amount = Number(input)
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Enter a valid amount.')
      return
    }
    if (amount > (balance || 0)) {
      alert('You cannot withdraw more than your balance.')
      return
    }
    setBusy(true)
    try {
      const { payoutStatus } = await api.withdrawWallet(amount)
      await reload()
      alert(
        payoutStatus === 'success'
          ? 'Withdrawal sent to your bank account!'
          : "Withdrawal started — it's finishing up and should land shortly.",
      )
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="text-center text-black/40 py-16 text-[13px] font-medium">Loading your wallet…</p>
  }

  return (
    <div className="space-y-5 max-w-[560px] mx-auto">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">Wallet</h1>
        <p className="text-[12px] text-black/50 font-medium mt-0.5">Top up, get paid, and withdraw</p>
      </div>

      {error && (
        <div className="rounded-[12px] border-[1.5px] border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-[24px] border-[1.5px] border-black p-6 shadow-[0_8px_24px_rgba(0,0,0,0.06)] space-y-4">
        <div className="flex items-center gap-2 text-black/50">
          <WalletIcon size={14} />
          <span className="text-[11px] font-bold tracking-widest uppercase">Balance</span>
        </div>
        <p className="text-[32px] font-bold tracking-tight">{fmtMoney(balance)}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleTopup}
            disabled={busy}
            className="flex-1 h-11 rounded-full bg-[#0A13E6] text-white text-[13px] font-semibold border-[1.5px] border-black flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <ArrowDownToLine size={14} /> Top up
          </button>
          <button
            type="button"
            onClick={handleWithdraw}
            disabled={busy}
            className="flex-1 h-11 rounded-full bg-white text-black text-[13px] font-semibold border-[1.5px] border-black flex items-center justify-center gap-1.5 hover:bg-black hover:text-white transition disabled:opacity-50"
          >
            <ArrowUpFromLine size={14} /> Withdraw
          </button>
        </div>
        {!user.payoutReady && (
          <p className="text-[11px] text-black/40 font-medium flex items-center gap-1.5">
            <Landmark size={12} />
            <Link to="/profile" className="underline">
              Add a payout bank account
            </Link>{' '}
            to enable withdrawals.
          </p>
        )}
      </div>

      <div>
        <h2 className="text-[13px] font-bold tracking-tight mb-2">Activity</h2>
        {transactions.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-[20px] border-[1.5px] border-dashed border-black/20">
            <p className="text-black/50 text-[13px] font-medium">No wallet activity yet.</p>
          </div>
        ) : (
          <ul className="bg-white rounded-[20px] border-[1.5px] border-black divide-y divide-black/10 overflow-hidden">
            {transactions.map((t) => (
              <li key={t.id} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[13px]">{TYPE_LABEL[t.type] || t.type}</p>
                  <p className="text-[11px] text-black/40 mt-0.5">{new Date(t.created_at).toLocaleString()}</p>
                </div>
                <span
                  className={`text-[13px] font-bold shrink-0 ${CREDIT_TYPES.has(t.type) ? 'text-green-700' : 'text-black'}`}
                >
                  {CREDIT_TYPES.has(t.type) ? '+' : '-'}
                  {fmtMoney(t.amount)}
                </span>
                <span
                  className={`text-[10px] font-semibold px-2 py-1 rounded-full shrink-0 capitalize ${STATUS_STYLE[t.status] || STATUS_STYLE.success}`}
                >
                  {t.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}