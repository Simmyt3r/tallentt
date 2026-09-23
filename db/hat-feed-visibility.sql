-- Existing and new Hats stay out of the Bento feed until their owner opts in.
-- Safe to re-run: existing publication choices are preserved.
ALTER TABLE hats ADD COLUMN IF NOT EXISTS feed_visible BOOLEAN NOT NULL DEFAULT false;
