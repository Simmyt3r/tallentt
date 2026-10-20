-- Reviewed notification category and daily digest schema.
-- Existing preferences and recorded money/booking notifications are retained.
BEGIN;

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS associates BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS vibes_mode TEXT NOT NULL DEFAULT 'digest';

-- Allows a single claim per user/day and prevents duplicate digest delivery.
CREATE TABLE IF NOT EXISTS notification_daily_digests (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  digest_day DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'sending' CHECK (status IN ('sending','sent')),
  attempts INT NOT NULL DEFAULT 1,
  sent_at TIMESTAMPTZ,
  PRIMARY KEY (user_id,digest_day)
);

COMMIT;
