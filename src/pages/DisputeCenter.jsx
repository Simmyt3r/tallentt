import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'
import { api } from '../lib/api.js'

const money = value => new Intl.NumberFormat('en-NG', {
  style: 'currency', currency: 'NGN', maximumFractionDigits: 0,
}).format(Number(value || 0))

export default function DisputeCenter() {
  const [cases, setCases] = useState([])
  const [filter, setFilter] = useState('open')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const result = await api.getMyDisputes()
      setCases(result.disputes || [])
    } catch (err) {
      setError(err.message || 'Could not load your disputes.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { refresh() }, [])

  const visible = cases.filter(item => filter === 'all' || item.status === filter)
  return <main className="mx-auto max-w-[860px] space-y-5 pb-10">
    <header className="rounded-2xl border border-black/10 bg-white p-5">
      <h1 className="text-[22px] font-black">Dispute Center</h1>
      <p className="mt-2 text-[12px] text-black/60">
        Track an escrow dispute, read the decision, and return to the deal to review messages and evidence.
        Neither party can release held funds while a dispute is under review.
      </p>
      <p className="mt-2 text-[12px] text-black/60">
        To open a new dispute, choose an eligible deal in <Link to="/deals?tab=active" className="font-bold text-[#0A13E6] underline">My Deals</Link>
        and select Open dispute in its progress section.
      </p>
    </header>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-2" aria-label="Dispute status filter">
        {['open','released','refunded','all'].map(status =>
          <button key={status} type="button" onClick={() => setFilter(status)}
            aria-pressed={filter === status}
            className={`min-h-10 rounded-full border px-3 text-[12px] font-bold ${filter === status ? 'border-black bg-black text-white' : 'border-black/15 bg-white'}`}>
            {status === 'open' ? 'Under review' : status === 'all' ? 'All' : status === 'released' ? 'Released' : 'Refunded'}
          </button>)}
      </div>
      <button type="button" onClick={refresh} disabled={loading} className="flex min-h-10 items-center gap-2 rounded-full border border-black/20 bg-white px-4 text-[12px] font-bold disabled:opacity-50">
        <RefreshCw size={14}/> Refresh
      </button>
    </div>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-[12px] text-red-700">{error}</p>}
    {loading && <p role="status" className="py-10 text-center text-[12px] text-black/50">Loading disputes…</p>}
    {!loading && !error && !visible.length && <div className="rounded-2xl border border-black/10 bg-white p-8 text-center text-[13px] text-black/50">
      No disputes in this category.
    </div>}
    <div className="space-y-3">
      {visible.map(item => <section key={item.escrow_id} className="rounded-2xl border border-black/10 bg-white p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-black">{item.hat_title}</h2>
            <p className="mt-1 text-[11px] text-black/50">
              @{item.client_username} · @{item.talent_username} · {new Date(item.created_at).toLocaleDateString()}
            </p>
          </div>
          <span className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold ${item.status === 'open' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
            {item.status === 'open' ? <AlertTriangle size={13}/> : <CheckCircle2 size={13}/>}
            {item.status === 'open' ? 'Under review' : item.status === 'released' ? 'Released to talent' : 'Refunded to client'}
          </span>
        </div>
        <p className="text-[12px]"><strong>Reason:</strong> {item.reason}</p>
        <p className="text-[12px] text-black/65">
          {money(Math.max(0, Number(item.amount) - Number(item.start_released_amount || 0)))} {item.status === 'open' ? 'held in escrow' : 'settled after review'}
        </p>
        {item.resolution_note && <p className="rounded-lg bg-[#F7F3EB] p-3 text-[12px]"><strong>Decision:</strong> {item.resolution_note}</p>}
        <Link to={`/deals/${item.escrow_id}`} className="inline-flex min-h-10 items-center rounded-full border border-black px-4 text-[12px] font-bold">
          Review deal and evidence
        </Link>
      </section>)}
    </div>
    <p className="text-[11px] text-black/40">Displays up to 100 most recent cases. Admin decisions are final within the current dispute workflow.</p>
  </main>
}
