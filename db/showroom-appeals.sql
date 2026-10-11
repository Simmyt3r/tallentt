-- Apply after db/schema.sql on existing installations.
-- Normal Showroom listings are automatically admitted; this table handles exceptions only.
CREATE TABLE IF NOT EXISTS showroom_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hat_id UUID NOT NULL REFERENCES hats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  explanation TEXT NOT NULL CHECK (char_length(explanation) BETWEEN 15 AND 1000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolution_note TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_showroom_appeal_pending ON showroom_appeals (hat_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_showroom_appeals_queue ON showroom_appeals (created_at, id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_showroom_appeals_owner ON showroom_appeals (user_id, created_at DESC);
