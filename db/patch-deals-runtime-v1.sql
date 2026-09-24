-- ChombuTar My Deals + notification runtime compatibility patch.
-- Safe to run repeatedly on an existing PostgreSQL/Neon production database.
BEGIN;

-- Hat availability fields used by the current create/edit APIs.
ALTER TABLE hats ADD COLUMN IF NOT EXISTS available_days TEXT[] NOT NULL
  DEFAULT ARRAY['mon','tue','wed','thu','fri','sat','sun']::TEXT[];
ALTER TABLE hats ADD COLUMN IF NOT EXISTS available_from TIME;
ALTER TABLE hats ADD COLUMN IF NOT EXISTS available_to TIME;
ALTER TABLE hats ADD COLUMN IF NOT EXISTS hiring_duration TEXT;

UPDATE hats
SET available_days = ARRAY['mon','tue','wed','thu','fri','sat','sun']::TEXT[]
WHERE available_days IS NULL OR cardinality(available_days) = 0;

ALTER TABLE hats DROP CONSTRAINT IF EXISTS hats_available_days_check;
ALTER TABLE hats ADD CONSTRAINT hats_available_days_check CHECK (
  cardinality(available_days) BETWEEN 1 AND 7
  AND available_days <@ ARRAY['mon','tue','wed','thu','fri','sat','sun']::TEXT[]
);

-- My Deals thumbnails order by this column.
ALTER TABLE hat_media ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
UPDATE hat_media SET created_at = NOW() WHERE created_at IS NULL;
ALTER TABLE hat_media ALTER COLUMN created_at SET DEFAULT NOW();

-- Application lifecycle required by My Deals.
ALTER TABLE applications ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE applications ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE applications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE applications SET status = 'pending' WHERE status IS NULL;
UPDATE applications SET created_at = NOW() WHERE created_at IS NULL;
UPDATE applications SET updated_at = COALESCE(created_at, NOW()) WHERE updated_at IS NULL;

ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_status_check;
ALTER TABLE applications ADD CONSTRAINT applications_status_check
  CHECK (status IN ('pending','accepted','rejected','withdrawn'));

CREATE INDEX IF NOT EXISTS idx_applications_applicant
  ON applications (applicant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_hat
  ON applications (hat_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_hat_applicant
  ON applications (hat_id, applicant_id);

-- Booking/deal columns consumed by negotiation and My Deals.
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS application_id UUID
  REFERENCES applications(id) ON DELETE SET NULL;
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS request_kind TEXT NOT NULL DEFAULT 'booking';
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS pay_unit TEXT;
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS agreed_at TIMESTAMPTZ;
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS messages_updated_at TIMESTAMPTZ;
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS checkout_locked_at TIMESTAMPTZ;
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS checkout_reference TEXT;
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS work_status TEXT NOT NULL DEFAULT 'in_progress';
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS work_version INT NOT NULL DEFAULT 0;

UPDATE escrows e
SET currency = COALESCE(e.currency, h.currency, 'NGN'),
    pay_unit = COALESCE(
      e.pay_unit,
      CASE WHEN h.rate_unit = 'custom' THEN h.rate_unit_custom ELSE h.rate_unit END
    )
FROM hats h
WHERE h.id = e.hat_id
  AND (e.currency IS NULL OR e.pay_unit IS NULL);

UPDATE escrows
SET request_kind = CASE
  WHEN application_id IS NULL THEN 'booking'
  ELSE 'application'
END
WHERE request_kind IS NULL
   OR request_kind NOT IN ('booking','application');

ALTER TABLE escrows DROP CONSTRAINT IF EXISTS escrows_request_kind_check;
ALTER TABLE escrows ADD CONSTRAINT escrows_request_kind_check
  CHECK (request_kind IN ('booking','application'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_escrows_application
  ON escrows (application_id)
  WHERE application_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_escrows_checkout_reference
  ON escrows (checkout_reference)
  WHERE checkout_reference IS NOT NULL;

-- Proposal records carry deal currency/unit.
ALTER TABLE booking_messages ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE booking_messages ADD COLUMN IF NOT EXISTS pay_unit TEXT;

UPDATE booking_messages m
SET currency = COALESCE(m.currency, e.currency),
    pay_unit = COALESCE(m.pay_unit, e.pay_unit)
FROM escrows e
WHERE e.id = m.escrow_id
  AND (m.currency IS NULL OR m.pay_unit IS NULL);

-- Notifications must match what the current inbox and transactional
-- Book/Apply lifecycle insert and read.
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link_url TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

UPDATE notifications SET type = 'system' WHERE type IS NULL;
UPDATE notifications SET title = 'Notification' WHERE title IS NULL;
UPDATE notifications SET metadata = '{}'::jsonb WHERE metadata IS NULL;
UPDATE notifications SET created_at = NOW() WHERE created_at IS NULL;

ALTER TABLE notifications ALTER COLUMN type SET NOT NULL;
ALTER TABLE notifications ALTER COLUMN title SET NOT NULL;
ALTER TABLE notifications ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;
ALTER TABLE notifications ALTER COLUMN metadata SET NOT NULL;
ALTER TABLE notifications ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE notifications ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_title_length_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_title_length_check
  CHECK (char_length(title) <= 120);
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_body_length_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_body_length_check
  CHECK (body IS NULL OR char_length(body) <= 500);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

COMMIT;
