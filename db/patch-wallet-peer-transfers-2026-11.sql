-- Additive only. No existing wallet balance, escrow, or ledger row is changed.
BEGIN;
CREATE TABLE IF NOT EXISTS wallet_transfer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES users(id),
  recipient_id UUID NOT NULL REFERENCES users(id),
  client_token UUID NOT NULL,
  amount INT NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wallet_transfer_distinct_users CHECK (sender_id <> recipient_id),
  CONSTRAINT wallet_transfer_idempotency UNIQUE (sender_id, client_token)
);
CREATE INDEX IF NOT EXISTS idx_wallet_transfer_sender ON wallet_transfer_requests(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_transfer_recipient ON wallet_transfer_requests(recipient_id, created_at DESC);
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS transfer_id UUID REFERENCES wallet_transfer_requests(id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_transfer_id ON wallet_transactions(transfer_id)
  WHERE transfer_id IS NOT NULL;
-- This schema also supports the existing Live and QR booking ledger types.
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check CHECK(type IN (
  'topup','escrow_fund','escrow_start','escrow_release','withdrawal','refund',
  'live_stake','live_stake_refund','live_prize','live_owner_share',
  'live_bet_stake','live_bet_payout','live_bet_refund',
  'live_gift_sent','live_gift_earning','live_sponsor_rent','live_sponsor_rain',
  'live_support_sent','live_support_earning',
  'wallet_transfer_sent','wallet_transfer_received'
));
COMMIT;
