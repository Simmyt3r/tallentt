-- ChombuTar negotiation v1
-- Safe to run repeatedly on an existing PostgreSQL/Neon database.
BEGIN;

ALTER TABLE escrows ADD COLUMN IF NOT EXISTS application_id UUID REFERENCES applications(id) ON DELETE SET NULL;
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS request_kind TEXT NOT NULL DEFAULT 'booking';
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS pay_unit TEXT;
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS agreed_at TIMESTAMPTZ;

UPDATE escrows e
SET currency = COALESCE(e.currency, h.currency, 'NGN'),
    pay_unit = COALESCE(e.pay_unit, CASE WHEN h.rate_unit = 'custom' THEN h.rate_unit_custom ELSE h.rate_unit END)
FROM hats h
WHERE h.id = e.hat_id AND (e.currency IS NULL OR e.pay_unit IS NULL);

UPDATE escrows
SET request_kind = CASE WHEN application_id IS NULL THEN 'booking' ELSE 'application' END
WHERE request_kind IS NULL OR request_kind NOT IN ('booking','application');

ALTER TABLE escrows DROP CONSTRAINT IF EXISTS escrows_request_kind_check;
ALTER TABLE escrows ADD CONSTRAINT escrows_request_kind_check CHECK (request_kind IN ('booking','application'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_escrows_application ON escrows (application_id) WHERE application_id IS NOT NULL;

ALTER TABLE booking_messages ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE booking_messages ADD COLUMN IF NOT EXISTS pay_unit TEXT;

UPDATE booking_messages m
SET currency = COALESCE(m.currency, e.currency),
    pay_unit = COALESCE(m.pay_unit, e.pay_unit)
FROM escrows e
WHERE e.id = m.escrow_id AND (m.currency IS NULL OR m.pay_unit IS NULL);

COMMIT;
