-- Orbit Score governance and non-blocking review of new Hat data.
-- Only explicit administrator decisions enter this audit trail.
BEGIN;
CREATE TABLE IF NOT EXISTS orbit_score_config (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),
  weights JSONB NOT NULL DEFAULT '{"profile":15,"verification":20,"completed_work":25,"successful_hires":20,"contributions":10,"tenure":10}'::jsonb,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO orbit_score_config(singleton) VALUES(TRUE) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS hat_data_reviews (
  hat_id UUID PRIMARY KEY REFERENCES hats(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK(decision IN ('reviewed','needs_changes')),
  note TEXT NOT NULL DEFAULT '' CHECK(char_length(note)<=500),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hat_data_reviews_time ON hat_data_reviews(reviewed_at DESC);
COMMIT;