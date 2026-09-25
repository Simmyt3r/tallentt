-- Run before deploying QR settlement APIs. Atomic and safe to repeat.
BEGIN;
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS work_started_at TIMESTAMPTZ;
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS start_released_amount INT NOT NULL DEFAULT 0;
ALTER TABLE escrows DROP CONSTRAINT IF EXISTS escrows_work_state_check;

-- Existing funded bookings in progress can use the new start checkpoint.
-- Already submitted bookings retain their state and settle their full
-- remaining balance at completion; no historical payout is fabricated.
UPDATE escrows SET work_status = 'awaiting_start'
WHERE status = 'secured' AND work_status = 'in_progress' AND work_started_at IS NULL;

ALTER TABLE escrows DROP CONSTRAINT IF EXISTS escrows_qr_balance_check;
ALTER TABLE escrows ADD CONSTRAINT escrows_qr_balance_check CHECK (
  start_released_amount BETWEEN 0 AND amount
  AND (work_started_at IS NOT NULL OR start_released_amount = 0)
);
ALTER TABLE escrows ADD CONSTRAINT escrows_work_state_check CHECK (
  work_version >= 0 AND (
    (status IN ('not_funded', 'cancelled') AND work_status = 'in_progress') OR
    (status = 'secured' AND work_status IN ('awaiting_start', 'in_progress', 'submitted', 'revision_requested', 'awaiting_completion', 'disputed')) OR
    (status = 'released' AND work_status = 'completed') OR
    (status = 'refunded' AND work_status = 'refunded')
  )
);

ALTER TABLE booking_events DROP CONSTRAINT IF EXISTS booking_events_action_check;
ALTER TABLE booking_events ADD CONSTRAINT booking_events_action_check CHECK (
  action IN ('scan_start', 'scan_completion', 'submit_delivery', 'request_revision',
             'open_dispute', 'approve_delivery', 'resolve_release', 'resolve_refund')
);

ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check CHECK (
  type IN ('topup', 'escrow_fund', 'escrow_start', 'escrow_release', 'withdrawal', 'refund',
           'live_stake', 'live_stake_refund', 'live_prize', 'live_owner_share',
           'live_bet_stake', 'live_bet_payout', 'live_bet_refund',
           'live_gift_sent', 'live_gift_earning', 'live_sponsor_rent', 'live_sponsor_rain',
           'live_support_sent', 'live_support_earning')
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_booking_start_release ON wallet_transactions (escrow_id)
  WHERE escrow_id IS NOT NULL AND type = 'escrow_start' AND status = 'success';

CREATE TABLE IF NOT EXISTS booking_qr_tokens (
  escrow_id UUID NOT NULL REFERENCES escrows(id),
  stage TEXT NOT NULL CHECK (stage IN ('start', 'completion')),
  token_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (escrow_id, stage)
);
COMMIT;
