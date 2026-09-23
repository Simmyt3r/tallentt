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

WITH legacy_application_deals AS (
  SELECT DISTINCT ON (a.id)
         a.id AS application_id,
         e.id AS escrow_id
  FROM applications a
  JOIN hats h ON h.id = a.hat_id
  JOIN escrows e
    ON e.hat_id = a.hat_id
   AND e.client_id = h.user_id
   AND e.talent_id = a.applicant_id
  WHERE e.application_id IS NULL
    AND h.role = 'client'
  ORDER BY a.id,
           CASE WHEN e.status IN ('not_funded','secured') THEN 0 ELSE 1 END,
           e.created_at DESC
)
UPDATE escrows e
SET application_id = legacy.application_id,
    request_kind = 'application'
FROM legacy_application_deals legacy
WHERE e.id = legacy.escrow_id;

INSERT INTO escrows
  (hat_id, client_id, talent_id, amount, application_id, request_kind, currency, pay_unit, contacts_unlocked)
SELECT h.id, h.user_id, a.applicant_id, h.price_min, a.id, 'application',
       COALESCE(h.currency, 'NGN'),
       CASE WHEN h.rate_unit = 'custom' THEN h.rate_unit_custom ELSE h.rate_unit END,
       false
FROM applications a
JOIN hats h ON h.id = a.hat_id
LEFT JOIN escrows e ON e.application_id = a.id
WHERE a.status = 'pending'
  AND h.role = 'client'
  AND h.price_type = 'range'
  AND e.id IS NULL;

UPDATE escrows
SET agreed_at = COALESCE(agreed_at, created_at)
WHERE contacts_unlocked = true AND agreed_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_escrows_application ON escrows (application_id) WHERE application_id IS NOT NULL;

ALTER TABLE booking_messages ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE booking_messages ADD COLUMN IF NOT EXISTS pay_unit TEXT;

UPDATE booking_messages m
SET currency = COALESCE(m.currency, e.currency),
    pay_unit = COALESCE(m.pay_unit, e.pay_unit)
FROM escrows e
WHERE e.id = m.escrow_id AND (m.currency IS NULL OR m.pay_unit IS NULL);

COMMIT;
