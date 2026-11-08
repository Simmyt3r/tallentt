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
// An unavailable verification provider is a transient processing failure:
// Paystack should resend its signed webhook instead of losing the payment.
function verificationUnavailable(reason){
  return Object.assign(new Error(reason),{status:503,retryable:true,code:'PAYSTACK_VERIFY_UNAVAILABLE'})
}
export async function verifyPaystackTransaction(reference) {
  if(typeof reference!=='string'||!reference.trim()||reference.length>200)
    throw Object.assign(new Error('A valid payment reference is required.'),{status:400})
  let res
  try{
    res=await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,{
      headers:{Authorization:`Bearer ${getSecretKey()}`},
      signal:AbortSignal.timeout(8000),
    })
  }catch(err){
    throw verificationUnavailable('Paystack verification is temporarily unavailable.')
  }
  let payload
  try{payload=await res.json()}catch{throw verificationUnavailable('Paystack verification returned an unreadable response.')}
  if(!res.ok||payload?.status!==true||!payload?.data||typeof payload.data!=='object'){
    throw verificationUnavailable('Paystack could not verify this payment yet.')
  }
  return payload.data
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

// Paystack-Signature signs `timestamp.rawBody` with the whsec_ webhook
// signing secret. Support the older X-Paystack-Signature during migration.
// Never fall back to a legacy header when the newer one is invalid.
export function verifyPaystackSignedWebhook(rawBody,{newSignature,legacySignature}={},nowMs=Date.now()){
  if(newSignature!==undefined&&newSignature!==null){
    const secret=process.env.PAYSTACK_WEBHOOK_SECRET||process.env.PAYSTACK_WEBHOOK_SIGNING_SECRET
    if(!secret||!secret.startsWith('whsec_')||typeof newSignature!=='string')return false
    const parts=newSignature.split(',').map(x=>x.trim())
    const timestamps=parts.filter(x=>x.startsWith('t='))
    if(timestamps.length!==1||!/^t=[0-9]{10,12}$/.test(timestamps[0]))return false
    const timestamp=Number(timestamps[0].slice(2))
    if(!Number.isSafeInteger(timestamp)||Math.abs(Math.trunc(nowMs/1000)-timestamp)>300)return false
    const expected=crypto.createHmac('sha512',secret)
      .update(Buffer.concat([Buffer.from(timestamp+'.'),Buffer.from(rawBody)])).digest('hex')
    const target=Buffer.from(expected,'hex')
    return parts.some(part=>{
      const match=/^v1=whk_[A-Za-z0-9_-]+:([a-f0-9]{128})$/.exec(part)
      return Boolean(match)&&crypto.timingSafeEqual(target,Buffer.from(match[1],'hex'))
    })
  }
  return verifyPaystackWebhookSignature(rawBody,legacySignature)
}
