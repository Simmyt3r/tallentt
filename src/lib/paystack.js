// Path: api/_lib/paystack.js
const PAYSTACK_BASE = 'https://api.paystack.co'

function getSecretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) {
    throw new Error('PAYSTACK_SECRET_KEY is not set. Add it in Vercel → Settings → Environment Variables.')
  }
  return key
}

// Verifies a transaction reference directly against Paystack's servers —
// the client-side popup only tells us a payment *looked* successful, this
// is what actually confirms it before we ever mark an escrow as funded.
// Never trust a reference or amount reported by the browser alone.
// Returns Paystack's transaction object: { status, amount (kobo),
// currency, reference, customer, ... }.
export async function verifyPaystackTransaction(reference) {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${getSecretKey()}` },
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.status) {
    throw new Error(data?.message || 'Could not verify payment with Paystack.')
  }
  return data.data
}