-- Run this once against your existing database to add the "Hat Name" field
-- (a short nickname like "Weekend Wedding Package", shown as the feed card's
-- headline) that schema.sql now defines for fresh installs. Separate from
-- hat_title, which stays "what service" / "who you're looking for". Safe to
-- re-run.

ALTER TABLE hats ADD COLUMN IF NOT EXISTS hat_name TEXT;

-- Backfill from the existing title so old listings don't show a blank
-- headline, then lock the column down for anything saved from here on.
UPDATE hats SET hat_name = hat_title WHERE hat_name IS NULL;
ALTER TABLE hats ALTER COLUMN hat_name SET NOT NULL;

ALTER TABLE hats DROP CONSTRAINT IF EXISTS hats_hat_name_length_check;
ALTER TABLE hats ADD CONSTRAINT hats_hat_name_length_check CHECK (char_length(hat_name) <= 60);
