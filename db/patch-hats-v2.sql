-- Run this once against your existing database to bring the hats table up
-- to the new Hats Card spec. Safe to re-run (every step is guarded).
--
-- What this fixes:
--   * "Orbit" was overloaded — the `orbits` table / `hats.orbit` column was
--     actually the CATEGORY picker, while `hats.orbit_score` (unchanged) is
--     the real, separately-computed confidence score. Renamed the category
--     side of that to remove the collision.
--   * Hat Type now supports the full 5-value set instead of 3.
--   * New fields: delivery mode, and a fixed/range pricing split.

-- 1. Categories table (was `orbits`) -----------------------------------
ALTER TABLE IF EXISTS orbits RENAME TO categories;

-- 2. hats.orbit -> hats.category ----------------------------------------
ALTER TABLE hats RENAME COLUMN orbit TO category;
DROP INDEX IF EXISTS idx_hats_orbit;
CREATE INDEX IF NOT EXISTS idx_hats_category ON hats (category);

-- 3. Hat Type — widen from 3 values to the full 5 -----------------------
ALTER TABLE hats DROP CONSTRAINT IF EXISTS hats_hat_type_check;
UPDATE hats SET hat_type = 'Full-time' WHERE hat_type = 'Fulltime';
ALTER TABLE hats ADD CONSTRAINT hats_hat_type_check
  CHECK (hat_type IN ('Full-time','Part-time','Freelance','Contract','One-Off'));
ALTER TABLE hats ALTER COLUMN hat_type SET DEFAULT 'Freelance';

-- 4. Client hiring duration ----------------------------------------------
ALTER TABLE hats ADD COLUMN IF NOT EXISTS hiring_duration TEXT;
ALTER TABLE hats DROP CONSTRAINT IF EXISTS hats_hiring_duration_check;
ALTER TABLE hats ADD CONSTRAINT hats_hiring_duration_check CHECK (
  hiring_duration IS NULL OR hiring_duration IN ('1 month','3 months','6 months','1 year','1 year (renewable)','Permanent job')
);

-- 5. Delivery mode --------------------------------------------------------
ALTER TABLE hats ADD COLUMN IF NOT EXISTS delivery_mode TEXT;
ALTER TABLE hats DROP CONSTRAINT IF EXISTS hats_delivery_mode_check;
ALTER TABLE hats ADD CONSTRAINT hats_delivery_mode_check
  CHECK (delivery_mode IS NULL OR delivery_mode IN ('Physical','Remote','Hybrid'));

-- 6. Price settings: fixed (rate + unit) vs range (min/max + negotiable) --
ALTER TABLE hats ADD COLUMN IF NOT EXISTS price_type TEXT DEFAULT 'fixed';
ALTER TABLE hats DROP CONSTRAINT IF EXISTS hats_price_type_check;
ALTER TABLE hats ADD CONSTRAINT hats_price_type_check
  CHECK (price_type IN ('fixed','range'));

ALTER TABLE hats ADD COLUMN IF NOT EXISTS price_negotiable BOOLEAN DEFAULT false;
ALTER TABLE hats ADD COLUMN IF NOT EXISTS rate_unit TEXT;
ALTER TABLE hats DROP CONSTRAINT IF EXISTS hats_rate_unit_check;
ALTER TABLE hats ADD CONSTRAINT hats_rate_unit_check
  CHECK (rate_unit IS NULL OR rate_unit IN ('hr','day','week','month','year','custom'));
ALTER TABLE hats ADD COLUMN IF NOT EXISTS rate_unit_custom TEXT;

-- price_min used to be required (it doubled as "the" price for every hat).
-- Now it's range-mode only, so existing fixed-price hats won't have it set.
ALTER TABLE hats ALTER COLUMN price_min DROP NOT NULL;
ALTER TABLE hats ALTER COLUMN price_min DROP DEFAULT;

-- Backfill: every existing row was effectively "fixed" pricing keyed off
-- price_min (see old api/escrows/index.js). Move that into rate/rate_unit
-- so old listings keep displaying correctly under the new fixed/range split.
UPDATE hats
SET price_type = 'fixed',
    rate = COALESCE(rate, price_min),
    rate_unit = COALESCE(rate_unit, 'custom')
WHERE price_max IS NULL OR price_max = price_min;

UPDATE hats
SET price_type = 'range'
WHERE price_max IS NOT NULL AND price_max <> price_min;

-- 7. Weekly availability --------------------------------------------------
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

-- 8. Reseed the 14 MECE categories (additive — old custom categories some
--    users already created are left in place, not replaced) --------------
INSERT INTO categories (name) VALUES
  ('Beauty & Grooming'),
  ('Fashion & Styling'),
  ('Photography & Videography'),
  ('Music & Audio'),
  ('Performing Arts & Entertainment'),
  ('Visual Arts, Design & Crafts'),
  ('Modeling & Acting'),
  ('Food & Catering'),
  ('Events & Hospitality'),
  ('Health, Wellness & Fitness'),
  ('Home Services & Skilled Trades'),
  ('Tech & Digital Services'),
  ('Business, Admin & Professional Services'),
  ('Education & Training')
ON CONFLICT (name) DO NOTHING;
