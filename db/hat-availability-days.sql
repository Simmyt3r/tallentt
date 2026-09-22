-- ChombuTar Hat weekday availability.
-- Safe to run repeatedly on an existing Neon database.
BEGIN;

ALTER TABLE hats
  ADD COLUMN IF NOT EXISTS available_days TEXT[] NOT NULL
  DEFAULT ARRAY['mon','tue','wed','thu','fri','sat','sun']::TEXT[];

UPDATE hats
SET available_days = ARRAY['mon','tue','wed','thu','fri','sat','sun']::TEXT[]
WHERE available_days IS NULL OR cardinality(available_days) = 0;

ALTER TABLE hats DROP CONSTRAINT IF EXISTS hats_available_days_check;
ALTER TABLE hats ADD CONSTRAINT hats_available_days_check CHECK (
  cardinality(available_days) BETWEEN 1 AND 7
  AND available_days <@ ARRAY['mon','tue','wed','thu','fri','sat','sun']::TEXT[]
);

COMMIT;
