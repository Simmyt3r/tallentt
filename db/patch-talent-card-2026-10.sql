BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS talent_card JSONB NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(talent_card) = 'object');
COMMIT;
