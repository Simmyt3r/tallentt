import { Link } from 'react-router-dom'

const money = (amount, currency = 'NGN') =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: currency || 'NGN',
    maximumFractionDigits: 0,
  }).format(Number(amount || 0))

export default function EscrowFundingCard({
  amount,
  currency = 'NGN',
  walletBalance = 0,
  busy = false,
  onFund,
  returnTo = '/deals?role=client&tab=active',
  blockedByNegotiation = false,
  negotiationUrl = null,
}) {
  const dealAmount = Number(amount || 0)
  const balance = Number(walletBalance || 0)
  const shortfall = Math.max(0, dealAmount - balance)
  const enough = balance >= dealAmount

  if (blockedByNegotiation) {
    return (
      <section className="rounded-[16px] border border-amber-300 bg-amber-50 px-3.5 py-3">
        <p className="text-[10px] font-black uppercase tracking-[0.1em] text-amber-700">
          Escrow not ready
        </p>
        <p className="mt-1 text-[12px] font-black">Agree the final price first</p>
        <p className="mt-1 text-[10.5px] leading-relaxed text-amber-900/70">
          Funding stays locked while negotiation is unfinished. Once both sides agree on the price,
          the client can fund escrow from the ChombuTar wallet.
        </p>
        {negotiationUrl && (
          <Link
            to={negotiationUrl}
            className="mt-3 inline-flex h-9 items-center rounded-full bg-black px-4 text-[11px] font-black text-white"
          >
            Open Negotiation Center
          </Link>
        )}
      </section>
    )
  }

  const walletUrl = `/wallet?topup=${encodeURIComponent(String(Math.ceil(shortfall)))}&return=${encodeURIComponent(returnTo)}`

  return (
    <section className="rounded-[16px] border border-[#0A13E6]/15 bg-[#0A13E6]/[0.04] px-3.5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-[#0A13E6]">
            Fund escrow
          </p>
          <p className="mt-1 text-[12px] font-black">
            {money(dealAmount, currency)} will be held securely
          </p>
          <p className="mt-1 max-w-[520px] text-[10.5px] leading-relaxed text-black/50">
            The full agreed amount moves from your wallet into escrow. The talent receives nothing
            until the Start QR is scanned.
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-[12px] border border-black/10 bg-white px-3 py-2">
          <p className="text-[9px] font-black uppercase tracking-[0.08em] text-black/35">Deal amount</p>
          <p className="mt-0.5 text-[12px] font-black">{money(dealAmount, currency)}</p>
        </div>
        <div className="rounded-[12px] border border-black/10 bg-white px-3 py-2">
          <p className="text-[9px] font-black uppercase tracking-[0.08em] text-black/35">Wallet balance</p>
          <p className="mt-0.5 text-[12px] font-black">{money(balance, currency)}</p>
        </div>
      </div>

      {!enough && (
        <p className="mt-2 text-[11px] font-bold text-amber-800">
          You need {money(shortfall, currency)} more to fund this escrow.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {enough ? (
          <button
            type="button"
            disabled={busy}
            onClick={onFund}
            className="h-10 rounded-full bg-[#0A13E6] px-4 text-[11px] font-black text-white disabled:opacity-50"
          >
            {busy ? 'Funding escrow…' : `Fund escrow ${money(dealAmount, currency)}`}
          </button>
        ) : (
          <Link
            to={walletUrl}
            className="inline-flex h-10 items-center rounded-full bg-[#0A13E6] px-4 text-[11px] font-black text-white"
          >
            Top up {money(shortfall, currency)}
          </Link>
        )}
      </div>
    </section>
  )
}
