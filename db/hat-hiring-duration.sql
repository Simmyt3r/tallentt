-- ChombuTar Client Hat hiring duration.
-- Safe to run repeatedly.
BEGIN;

ALTER TABLE hats ADD COLUMN IF NOT EXISTS hiring_duration TEXT;

ALTER TABLE hats DROP CONSTRAINT IF EXISTS hats_hiring_duration_check;
ALTER TABLE hats ADD CONSTRAINT hats_hiring_duration_check CHECK (
  hiring_duration IS NULL OR hiring_duration IN (
    '1 month',
    '3 months',
    '6 months',
    '1 year',
    '1 year (renewable)',
    'Permanent job'
  )
);

COMMIT;
