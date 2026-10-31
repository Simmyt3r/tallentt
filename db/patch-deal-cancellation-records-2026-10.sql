BEGIN;
CREATE TABLE IF NOT EXISTS deal_cancellation_records (
  escrow_id UUID PRIMARY KEY REFERENCES escrows(id) ON DELETE RESTRICT,
  cancelled_by UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 500),
  cancelled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deal_cancelled_actor ON deal_cancellation_records(cancelled_by,cancelled_at DESC);
COMMIT;
