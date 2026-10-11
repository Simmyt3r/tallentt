-- Existing media retain legacy status so activation does not hide old listings.
-- Newly uploaded media are 'pending' only when screening enforcement is enabled.
ALTER TABLE hat_media ADD COLUMN IF NOT EXISTS screening_status TEXT NOT NULL DEFAULT 'legacy'
  CHECK (screening_status IN ('legacy','pending','processing','passed','held','rejected'));
ALTER TABLE hat_media ADD COLUMN IF NOT EXISTS screening_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hat_media ADD COLUMN IF NOT EXISTS screening_reason TEXT;
ALTER TABLE hat_media ADD COLUMN IF NOT EXISTS screening_checked_at TIMESTAMPTZ;
ALTER TABLE hat_media ADD COLUMN IF NOT EXISTS screening_locked_at TIMESTAMPTZ;
ALTER TABLE hat_media ADD COLUMN IF NOT EXISTS screening_lock_token UUID;
ALTER TABLE hat_media ADD COLUMN IF NOT EXISTS screening_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_hat_media_screening_queue
  ON hat_media (screening_status, screening_retry_at, created_at)
  WHERE screening_status IN ('pending','processing');
CREATE INDEX IF NOT EXISTS idx_hat_media_screening_reviews
  ON hat_media (screening_checked_at, id)
  WHERE screening_status IN ('held','rejected');
CREATE INDEX IF NOT EXISTS idx_hat_media_public_id ON hat_media (public_id);
