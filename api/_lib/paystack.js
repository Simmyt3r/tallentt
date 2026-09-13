// Path: api/_lib/paystack.js
import crypto from 'node:crypto'

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

// Nigerian NUBAN banks Paystack supports — used to populate the bank
// picker when a talent adds their payout details.
export async function listBanks() {
  const res = await fetch(`${PAYSTACK_BASE}/bank?country=nigeria&currency=NGN`, {
    headers: { Authorization: `Bearer ${getSecretKey()}` },
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.status) {
    throw new Error(data?.message || 'Could not load the bank list.')
  }
  return data.data // [{ name, code, ... }]
}

// Confirms an account number actually belongs to a named account holder
// before we ever save it or pay out to it. Always call this server-side
// with the account number/bank code the client sent — never trust an
// account name the client claims on its own.
export async function resolveBankAccount(accountNumber, bankCode) {
  const params = new URLSearchParams({ account_number: accountNumber, bank_code: bankCode })
  const res = await fetch(`${PAYSTACK_BASE}/bank/resolve?${params}`, {
    headers: { Authorization: `Bearer ${getSecretKey()}` },
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.status) {
    throw new Error(data?.message || "Couldn't verify that account number — double-check the bank and number.")
  }
  return data.data // { account_number, account_name, bank_id }
}

// Registers a talent as a Paystack Transfer Recipient once; the returned
// recipient_code is then reused for every future payout to them.
export async function createTransferRecipient({ name, accountNumber, bankCode }) {
  const res = await fetch(`${PAYSTACK_BASE}/transferrecipient`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getSecretKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'nuban',
      name,
      account_number: accountNumber,
      bank_code: bankCode,
      currency: 'NGN',
    }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.status) {
    throw new Error(data?.message || 'Could not save payout details with Paystack.')
  }
  return data.data // { recipient_code, ... }
}

// Moves money from your Paystack balance to a talent's bank account.
// NOTE: this only completes immediately (transfer.status === 'success')
// if OTP is disabled for API transfers on your Paystack business account
// (Dashboard → Settings → Preferences). Otherwise Paystack returns
// status 'otp' and the transfer sits pending until finalized manually in
// the dashboard — there's no way to supply an OTP from an unattended
// server process.
export async function initiateTransfer({ amountNaira, recipientCode, reference, reason }) {
  const res = await fetch(`${PAYSTACK_BASE}/transfer`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getSecretKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'balance',
      amount: Math.round(amountNaira * 100), // kobo
      recipient: recipientCode,
      reference,
      reason,
    }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.status) {
    throw new Error(data?.message || 'Could not initiate the payout.')
  }
  return data.data // { transfer_code, status: 'success' | 'otp' | 'pending', reference, ... }
}

// Confirms a webhook POST actually came from Paystack. Paystack signs
// every webhook with HMAC-SHA512 of the *raw* request body using your
// secret key — must be computed over the exact bytes received, before
// any JSON.parse, or the signature won't match.
export function verifyPaystackWebhookSignature(rawBody, signature) {
  if (!signature) return false
  const expected = crypto.createHmac('sha512', getSecretKey()).update(rawBody).digest('hex')
  // Constant-time compare — a signature check that leaks timing info via
  // early-exit string comparison defeats the point of having one.
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(String(signature), 'utf8')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}