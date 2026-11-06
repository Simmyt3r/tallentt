// Credit transaction types must have the same direction on every ledger view.
export const WALLET_CREDIT_TYPES = Object.freeze([
  'topup', 'escrow_start', 'escrow_release', 'refund',
  'wallet_transfer_received', 'billing_refund',
  'live_stake_refund', 'live_prize', 'live_owner_share',
  'live_bet_payout', 'live_bet_refund', 'live_gift_earning', 'live_support_earning',
])
