-- Run this entire file on the database already using booking messages.
-- Atomic and rerunnable; does not modify user roles or existing balances.
BEGIN;
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS work_status TEXT NOT NULL DEFAULT 'in_progress';
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS work_version INT NOT NULL DEFAULT 0;
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
UPDATE escrows SET work_status = 'completed' WHERE status = 'released' AND work_status = 'in_progress';
ALTER TABLE escrows DROP CONSTRAINT IF EXISTS escrows_status_check;
ALTER TABLE escrows ADD CONSTRAINT escrows_status_check
  CHECK (status IN ('not_funded', 'secured', 'released', 'cancelled', 'refunded'));
ALTER TABLE escrows DROP CONSTRAINT IF EXISTS escrows_work_state_check;
ALTER TABLE escrows ADD CONSTRAINT escrows_work_state_check CHECK (
  work_version >= 0 AND (
    (status IN ('not_funded', 'cancelled') AND work_status = 'in_progress') OR
    (status = 'secured' AND work_status IN ('in_progress', 'submitted', 'revision_requested', 'disputed')) OR
    (status = 'released' AND work_status = 'completed') OR
    (status = 'refunded' AND work_status = 'refunded')
  )
);

CREATE TABLE IF NOT EXISTS booking_events (
  id BIGSERIAL PRIMARY KEY,
  escrow_id UUID NOT NULL REFERENCES escrows(id),
  actor_id UUID NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('submit_delivery', 'request_revision', 'open_dispute', 'approve_delivery', 'resolve_release', 'resolve_refund')),
  note TEXT NOT NULL CHECK (char_length(note) <= 2000),
  expected_version INT NOT NULL CHECK (expected_version >= 0),
  client_token UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (escrow_id, actor_id, client_token),
  UNIQUE (escrow_id, expected_version)
);
CREATE INDEX IF NOT EXISTS idx_booking_events_history ON booking_events (escrow_id, id DESC);

CREATE TABLE IF NOT EXISTS booking_disputes (
  escrow_id UUID PRIMARY KEY REFERENCES escrows(id),
  opened_by UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 2000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'released', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_by UUID REFERENCES users(id),
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  CHECK ((status = 'open' AND resolved_by IS NULL AND resolution_note IS NULL AND resolved_at IS NULL)
    OR (status <> 'open' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL
      AND resolution_note IS NOT NULL AND char_length(btrim(resolution_note)) BETWEEN 1 AND 2000))
);
CREATE INDEX IF NOT EXISTS idx_booking_disputes_queue ON booking_disputes (status, created_at, escrow_id);
-- A booking can fund exactly one final wallet credit, release OR refund.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_booking_settlement ON wallet_transactions (escrow_id)
  WHERE escrow_id IS NOT NULL AND type IN ('escrow_release', 'refund') AND status = 'success';
COMMIT;
