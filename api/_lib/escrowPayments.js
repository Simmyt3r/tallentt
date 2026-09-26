import { bookingError, requireBookingId } from './bookingRules.js'
import { applyVerifiedLegacyBookingCharge } from './bookingCheckout.js'

// Backward-compatible name for tests and any stale server import. A verified
// Paystack booking charge is never applied directly to escrow anymore: it is
// credited to the client's wallet first, then the escrow is funded by a wallet
// debit inside the same transaction.
export async function applyVerifiedPayment({ escrowId, reference, txn }) {
  requireBookingId(escrowId)
  if (typeof reference !== 'string' || !reference || txn?.reference !== reference) {
    throw bookingError(402, 'Payment reference does not match the verified transaction.')
  }
  if (txn?.status !== 'success' || txn?.currency !== 'NGN') {
    throw bookingError(402, 'A successful NGN payment is required.')
  }
  if (String(txn?.metadata?.escrow_id || '') !== escrowId || txn?.metadata?.wallet_topup) {
    throw bookingError(402, 'This payment reference does not belong to this booking.')
  }
  return applyVerifiedLegacyBookingCharge({ escrowId, reference, txn })
}
