-- ChombuTar full schema v5.1
-- Safe for fresh installs and existing Neon databases.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('talent', 'client', 'dual')) DEFAULT 'dual',
  is_admin BOOLEAN NOT NULL DEFAULT false,
  country TEXT,
  lga TEXT,
  avatar_url TEXT,
  bio TEXT,
  location TEXT,
  phone TEXT,
  nin_hash TEXT,
  nin_last4 TEXT,
  bank_code TEXT,
  bank_name TEXT,
  account_number TEXT,
  account_name TEXT,
  paystack_recipient_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Drop the legacy check BEFORE converting its values. Unknown roles fail the
-- replacement check and roll back the full migration; never grant privileges.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
UPDATE users SET role = CASE lower(btrim(role))
  WHEN 'creator' THEN 'talent' WHEN 'employer' THEN 'client' ELSE lower(btrim(role)) END;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'dual';

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nin_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nin_last4 TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS paystack_recipient_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
UPDATE users SET is_admin = false WHERE is_admin IS NULL;
ALTER TABLE users ALTER COLUMN is_admin SET DEFAULT false;
ALTER TABLE users ALTER COLUMN is_admin SET NOT NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('talent', 'client', 'dual'));

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nin_hash ON users (nin_hash) WHERE nin_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users (is_admin) WHERE is_admin = true;

-- Profile UX upgrade (see db/patch-profile-ux.sql for the standalone
-- version of just this block). Adds the identity/credibility fields the
-- redesigned Profile page needs that nothing else in the schema already
-- covers — kept minimal and reusing existing columns (bio, avatar_url,
-- location/lga/country) everywhere one already exists.
--   headline        — short professional headline, both roles (Talent:
--                      "Photographer & Video Editor"; Client: "Technology
--                      Company"). Distinct from `bio`, which is the longer
--                      About text.
--   skills          — Talent's profile-level skill chips. Deliberately
--                      separate from hats.skills (per-listing tags used
--                      for search/matching) — this is the person's general
--                      showcased skillset, not tied to one hat.
--   industry        — Client's Industry / Business Areas chips. Same
--                      shape as `skills` but semantically distinct, so
--                      kept as its own column rather than overloading one
--                      array for two different concepts (see PROFILE.md
--                      section 10).
--   company_suffix  — Client's legal suffix (Ltd., Inc., ...), stored
--                      separately from full_name so the app can render it
--                      without ever guessing/fabricating one and without
--                      ever double-appending it.
--   website          — one professional/portfolio link, shown on Share/About.
ALTER TABLE users ADD COLUMN IF NOT EXISTS headline TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS skills TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS industry TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_suffix TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS website TEXT;
UPDATE users SET skills = '{}' WHERE skills IS NULL;
UPDATE users SET industry = '{}' WHERE industry IS NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_headline_length_check;
ALTER TABLE users ADD CONSTRAINT users_headline_length_check CHECK (headline IS NULL OR char_length(headline) <= 80);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_website_length_check;
ALTER TABLE users ADD CONSTRAINT users_website_length_check CHECK (website IS NULL OR char_length(website) <= 300);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_company_suffix_check;
ALTER TABLE users ADD CONSTRAINT users_company_suffix_check
  CHECK (company_suffix IS NULL OR company_suffix IN ('Ltd.', 'Limited', 'Inc.', 'LLC', 'PLC', 'LLP', 'Corp.'));

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  hat_title TEXT NOT NULL,
  username TEXT NOT NULL,
  verified_name TEXT,
  is_verified BOOLEAN DEFAULT false,
  category TEXT NOT NULL,
  skills TEXT[],
  hat_type TEXT CHECK (hat_type IN ('Full-time','Part-time','Freelance','Contract','One-Off')) DEFAULT 'Freelance',
  delivery_mode TEXT CHECK (delivery_mode IN ('Physical','Remote','Hybrid')),
  country TEXT,
  country_flag TEXT,
  currency TEXT DEFAULT 'NGN',
  lga TEXT,
  motto TEXT CHECK (char_length(motto) <= 80),
  price_type TEXT CHECK (price_type IN ('fixed','range')) DEFAULT 'fixed',
  price_min INT,
  price_max INT,
  price_negotiable BOOLEAN DEFAULT false,
  rate INT,
  rate_unit TEXT CHECK (rate_unit IN ('hr','day','week','month','year','custom')),
  rate_unit_custom TEXT,
  active BOOLEAN DEFAULT true,
  availability BOOLEAN DEFAULT true,
  available_from TIME,
  available_to TIME,
  role TEXT CHECK (role IN ('talent','client','dual')) DEFAULT 'talent',
  rating DECIMAL DEFAULT 0,
  bookings INT DEFAULT 0,
  likes INT DEFAULT 0,
  views INT DEFAULT 0,
  comments_count INT DEFAULT 0,
  orbit_score INT DEFAULT 0,
  jobs_posted INT DEFAULT 0,
  spent INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF to_regclass('public.orbits') IS NOT NULL AND to_regclass('public.categories') IS NULL THEN
    ALTER TABLE orbits RENAME TO categories;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hats' AND column_name = 'orbit'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hats' AND column_name = 'category'
  ) THEN
    ALTER TABLE hats RENAME COLUMN orbit TO category;
  END IF;
END $$;

ALTER TABLE hats ADD COLUMN IF NOT EXISTS category TEXT;
UPDATE hats SET category = 'Tech & Digital Services' WHERE category IS NULL;
ALTER TABLE hats ALTER COLUMN category SET NOT NULL;
ALTER TABLE hats ADD COLUMN IF NOT EXISTS delivery_mode TEXT;
ALTER TABLE hats ADD COLUMN IF NOT EXISTS price_type TEXT DEFAULT 'fixed';
ALTER TABLE hats ADD COLUMN IF NOT EXISTS price_negotiable BOOLEAN DEFAULT false;
ALTER TABLE hats ADD COLUMN IF NOT EXISTS rate INT;
ALTER TABLE hats ADD COLUMN IF NOT EXISTS rate_unit TEXT;
ALTER TABLE hats ADD COLUMN IF NOT EXISTS rate_unit_custom TEXT;
ALTER TABLE hats ADD COLUMN IF NOT EXISTS available_from TIME;
ALTER TABLE hats ADD COLUMN IF NOT EXISTS available_to TIME;
ALTER TABLE hats ADD COLUMN IF NOT EXISTS views INT DEFAULT 0;
ALTER TABLE hats ADD COLUMN IF NOT EXISTS comments_count INT DEFAULT 0;
ALTER TABLE hats ADD COLUMN IF NOT EXISTS jobs_posted INT DEFAULT 0;
ALTER TABLE hats ADD COLUMN IF NOT EXISTS spent INT DEFAULT 0;
-- "Seeking" (Talent) / "Hiring" (Client) — what a Hat is for, e.g. "Wedding
-- photographer" — is now its own value, separate from hat_title (the name the
-- owner gives the Hat). Hats created before this carried both in hat_title, so
-- they start with the same text in both; the owner can edit either afterwards.
ALTER TABLE hats ADD COLUMN IF NOT EXISTS seeking TEXT;
UPDATE hats SET seeking = hat_title WHERE seeking IS NULL;
ALTER TABLE hats ALTER COLUMN price_min DROP NOT NULL;
ALTER TABLE hats ALTER COLUMN price_min DROP DEFAULT;
UPDATE hats SET hat_type = 'Full-time' WHERE hat_type = 'Fulltime';
UPDATE hats SET price_type = 'fixed', rate = COALESCE(rate, price_min), rate_unit = COALESCE(rate_unit, 'custom')
WHERE price_type IS NULL OR (price_max IS NULL OR price_max = price_min);
UPDATE hats SET price_type = 'range' WHERE price_max IS NOT NULL AND price_max <> price_min;

ALTER TABLE hats DROP CONSTRAINT IF EXISTS hats_hat_type_check;
ALTER TABLE hats ADD CONSTRAINT hats_hat_type_check CHECK (hat_type IN ('Full-time','Part-time','Freelance','Contract','One-Off'));
ALTER TABLE hats DROP CONSTRAINT IF EXISTS hats_delivery_mode_check;
ALTER TABLE hats ADD CONSTRAINT hats_delivery_mode_check CHECK (delivery_mode IS NULL OR delivery_mode IN ('Physical','Remote','Hybrid'));
ALTER TABLE hats DROP CONSTRAINT IF EXISTS hats_price_type_check;
ALTER TABLE hats ADD CONSTRAINT hats_price_type_check CHECK (price_type IN ('fixed','range'));
ALTER TABLE hats DROP CONSTRAINT IF EXISTS hats_rate_unit_check;
ALTER TABLE hats ADD CONSTRAINT hats_rate_unit_check CHECK (rate_unit IS NULL OR rate_unit IN ('hr','day','week','month','year','custom'));
ALTER TABLE hats DROP CONSTRAINT IF EXISTS hats_role_check;
ALTER TABLE hats ADD CONSTRAINT hats_role_check CHECK (role IN ('talent','client','dual'));

DROP INDEX IF EXISTS idx_hats_orbit;
CREATE INDEX IF NOT EXISTS idx_hats_user ON hats (user_id);
CREATE INDEX IF NOT EXISTS idx_hats_category ON hats (category);
CREATE INDEX IF NOT EXISTS idx_hats_role ON hats (role);
CREATE INDEX IF NOT EXISTS idx_hats_active ON hats (active);

CREATE TABLE IF NOT EXISTS hat_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hat_id UUID REFERENCES hats(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  public_id TEXT NOT NULL,
  type TEXT CHECK (type IN ('image','video','audio')),
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE hat_media ADD COLUMN IF NOT EXISTS caption TEXT;
CREATE INDEX IF NOT EXISTS idx_hat_media_hat ON hat_media (hat_id);

CREATE TABLE IF NOT EXISTS hat_likes (
  hat_id UUID REFERENCES hats(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (hat_id, user_id)
);

CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hat_id UUID NOT NULL REFERENCES hats(id) ON DELETE CASCADE,
  applicant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','rejected','withdrawn')) DEFAULT 'pending',
  message TEXT CHECK (message IS NULL OR char_length(message) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hat_id, applicant_id)
);

ALTER TABLE applications ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE applications ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE applications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_status_check;
ALTER TABLE applications ADD CONSTRAINT applications_status_check CHECK (status IN ('pending','accepted','rejected','withdrawn'));
CREATE INDEX IF NOT EXISTS idx_applications_applicant ON applications (applicant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_hat ON applications (hat_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_hat_applicant ON applications (hat_id, applicant_id);

CREATE TABLE IF NOT EXISTS escrows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hat_id UUID REFERENCES hats(id),
  client_id UUID REFERENCES users(id),
  talent_id UUID REFERENCES users(id),
  amount INT NOT NULL,
  status TEXT CHECK (status IN ('not_funded','secured','released','cancelled')) DEFAULT 'not_funded',
  contacts_unlocked BOOLEAN DEFAULT false,
  payment_reference TEXT,
  funded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  released_at TIMESTAMPTZ
);

ALTER TABLE escrows ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS funded_at TIMESTAMPTZ;
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;
ALTER TABLE escrows DROP CONSTRAINT IF EXISTS escrows_status_check;
ALTER TABLE escrows ADD CONSTRAINT escrows_status_check CHECK (status IN ('not_funded','secured','released','cancelled','refunded'));
CREATE INDEX IF NOT EXISTS idx_escrows_client ON escrows (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_escrows_talent ON escrows (talent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_escrows_hat ON escrows (hat_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_escrows_payment_reference ON escrows (payment_reference) WHERE payment_reference IS NOT NULL;

-- Existing checkouts may already be open in an older PWA. Freeze their prices
-- once, on upgrade, so a delayed payment cannot fund a newly negotiated amount.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'escrows' AND column_name = 'checkout_locked_at') THEN
    ALTER TABLE escrows ADD COLUMN checkout_locked_at TIMESTAMPTZ;
    UPDATE escrows SET checkout_locked_at = NOW() WHERE status = 'not_funded';
  END IF;
END $$;
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS checkout_reference TEXT;
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS messages_updated_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS idx_escrows_checkout_reference ON escrows (checkout_reference) WHERE checkout_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS booking_messages (
  id BIGSERIAL PRIMARY KEY,
  escrow_id UUID NOT NULL REFERENCES escrows(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  recipient_id UUID NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('message', 'offer')),
  body TEXT NOT NULL CHECK (char_length(body) <= 2000),
  amount INT,
  offer_status TEXT,
  client_token UUID NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (escrow_id, sender_id, client_token),
  CHECK ((kind = 'message' AND char_length(btrim(body)) > 0 AND amount IS NULL AND offer_status IS NULL)
    OR (kind = 'offer' AND amount IS NOT NULL AND amount > 0 AND offer_status IS NOT NULL
      AND offer_status IN ('pending', 'accepted', 'declined', 'withdrawn', 'superseded')))
);
CREATE INDEX IF NOT EXISTS idx_booking_messages_thread ON booking_messages (escrow_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_booking_messages_unread ON booking_messages (escrow_id, recipient_id) WHERE read_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_messages_pending_offer ON booking_messages (escrow_id) WHERE offer_status = 'pending';

CREATE TABLE IF NOT EXISTS wallets (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance INT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('topup','escrow_fund','escrow_release','withdrawal','refund')),
  amount INT NOT NULL CHECK (amount > 0),
  balance_after INT NOT NULL CHECK (balance_after >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending','success','failed')) DEFAULT 'success',
  reference TEXT,
  escrow_id UUID REFERENCES escrows(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check CHECK (type IN ('topup','escrow_fund','escrow_release','withdrawal','refund'));
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_status_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_status_check CHECK (status IN ('pending','success','failed'));
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user ON wallet_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_escrow ON wallet_transactions (escrow_id) WHERE escrow_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_transactions_reference ON wallet_transactions (reference) WHERE reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL CHECK (char_length(title) <= 120),
  body TEXT CHECK (body IS NULL OR char_length(body) <= 500),
  link_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type TEXT;
UPDATE notifications SET type = 'system' WHERE type IS NULL;
ALTER TABLE notifications ALTER COLUMN type SET NOT NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title TEXT;
UPDATE notifications SET title = 'Notification' WHERE title IS NULL;
ALTER TABLE notifications ALTER COLUMN title SET NOT NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link_url TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
UPDATE notifications SET metadata = '{}'::jsonb WHERE metadata IS NULL;
ALTER TABLE notifications ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;
ALTER TABLE notifications ALTER COLUMN metadata SET NOT NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
UPDATE notifications SET created_at = NOW() WHERE created_at IS NULL;
ALTER TABLE notifications ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE notifications ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_title_length_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_title_length_check CHECK (char_length(title) <= 120);
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_body_length_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_body_length_check CHECK (body IS NULL OR char_length(body) <= 500);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin ON admin_audit_logs (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target ON admin_audit_logs (target_type, target_id);

CREATE TABLE IF NOT EXISTS leak_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  message TEXT,
  masked BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- Booking completion migration (kept identical to db/booking-completion.sql).
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS work_status TEXT NOT NULL DEFAULT 'in_progress';
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS work_version INT NOT NULL DEFAULT 0;
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
UPDATE escrows SET work_status = 'completed' WHERE status = 'released' AND work_status = 'in_progress';
ALTER TABLE escrows DROP CONSTRAINT IF EXISTS escrows_status_check;
ALTER TABLE escrows ADD CONSTRAINT escrows_status_check
  CHECK (status IN ('not_funded', 'secured', 'released', 'cancelled', 'refunded'));
ALTER TABLE escrows DROP CONSTRAINT IF EXISTS escrows_work_state_check;
ALTER TABLE escrows ADD CONSTRAINT escrows_work_state_check CHECK (
  work_version >= 0 AND (
    (status IN ('not_funded', 'cancelled') AND work_status = 'in_progress') OR
    (status = 'secured' AND work_status IN ('in_progress', 'submitted', 'revision_requested', 'disputed')) OR
    (status = 'released' AND work_status = 'completed') OR
    (status = 'refunded' AND work_status = 'refunded')
  )
);

CREATE TABLE IF NOT EXISTS booking_events (
  id BIGSERIAL PRIMARY KEY,
  escrow_id UUID NOT NULL REFERENCES escrows(id),
  actor_id UUID NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('submit_delivery', 'request_revision', 'open_dispute', 'approve_delivery', 'resolve_release', 'resolve_refund')),
  note TEXT NOT NULL CHECK (char_length(note) <= 2000),
  expected_version INT NOT NULL CHECK (expected_version >= 0),
  client_token UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (escrow_id, actor_id, client_token),
  UNIQUE (escrow_id, expected_version)
);
CREATE INDEX IF NOT EXISTS idx_booking_events_history ON booking_events (escrow_id, id DESC);

CREATE TABLE IF NOT EXISTS booking_disputes (
  escrow_id UUID PRIMARY KEY REFERENCES escrows(id),
  opened_by UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 2000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'released', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_by UUID REFERENCES users(id),
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  CHECK ((status = 'open' AND resolved_by IS NULL AND resolution_note IS NULL AND resolved_at IS NULL)
    OR (status <> 'open' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL
      AND resolution_note IS NOT NULL AND char_length(btrim(resolution_note)) BETWEEN 1 AND 2000))
);
CREATE INDEX IF NOT EXISTS idx_booking_disputes_queue ON booking_disputes (status, created_at, escrow_id);
-- A booking can fund exactly one final wallet credit, release OR refund.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_booking_settlement ON wallet_transactions (escrow_id)
  WHERE escrow_id IS NOT NULL AND type IN ('escrow_release', 'refund') AND status = 'success';

-- ============================================================================
-- Combutar Live — Arena Hall (1v1 competitions) + Stage Hall (performances).
-- See api/_lib/live.js for the settlement/scoring logic that reads and
-- writes these tables.
-- ============================================================================

-- Fixed catalog of Arena games. owner_id is the rights-holder account that
-- gets the 10% "game owner" cut on settlement (see live.js splitPot()) —
-- nullable because Ludo/CODM have no ChombuTar-side owner account yet; that
-- 10% simply stays unallocated (with the platform) until an admin sets one.
CREATE TABLE IF NOT EXISTS live_games (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  verification TEXT NOT NULL CHECK (verification IN ('engine', 'referee')),
  owner_id UUID REFERENCES users(id),
  active BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO live_games (code, name, verification) VALUES
  ('chess', 'Chess', 'engine'),
  ('draughts', 'Draught', 'engine'),
  ('ludo', 'Ludo', 'referee'),
  ('codm', 'CODM', 'referee')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS live_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall TEXT NOT NULL CHECK (hall IN ('arena', 'stage')),
  host_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  -- Arena only.
  game TEXT REFERENCES live_games(code),
  stake INT CHECK (stake IS NULL OR stake > 0),
  verification TEXT CHECK (verification IS NULL OR verification IN ('engine', 'referee')),
  -- If set, only this user may take the second Arena seat — how a Stage
  -- "I challenge you" turns into a targeted Arena invite (see live.js
  -- challenge()). NULL means open to whichever talent joins first.
  invited_user_id UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'live', 'reported', 'disputed', 'completed', 'cancelled')),
  winner_id UUID REFERENCES users(id),
  -- Set when a result is first reported; the opponent has
  -- dispute_window_seconds to dispute it before it auto-settles as reported
  -- (checked lazily — see live.js maybeAutoSettle()).
  dispute_opened_at TIMESTAMPTZ,
  dispute_window_seconds INT NOT NULL DEFAULT 30,
  dispute_reason TEXT CHECK (dispute_reason IS NULL OR char_length(dispute_reason) <= 1000),
  settled_at TIMESTAMPTZ,
  -- Stage only: audience can request Audio-Only mode client-side; this just
  -- records the host started the room framed that way for the data-cost copy.
  audio_only BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  CHECK ((hall = 'arena' AND game IS NOT NULL AND stake IS NOT NULL AND verification IS NOT NULL)
      OR (hall = 'stage' AND game IS NULL AND stake IS NULL AND verification IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_live_rooms_hall_status ON live_rooms (hall, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_rooms_host ON live_rooms (host_id, created_at DESC);

-- Arena: the two competing players. A row is inserted for the host at
-- create_room and for the opponent at join_room.
CREATE TABLE IF NOT EXISTS live_room_players (
  room_id UUID NOT NULL REFERENCES live_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);

-- Spectator backing on an Arena match — play money from the same wallet,
-- not real betting. One open back per spectator per room. Settled
-- parimutuel-style in live.js settleRoom(): winners split the full pool
-- proportionally to their own stake, no house cut.
CREATE TABLE IF NOT EXISTS live_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES live_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  backing_user_id UUID NOT NULL REFERENCES users(id),
  amount INT NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_live_bets_room ON live_bets (room_id);

-- Stage: one-way likes (never unliked — see live.js like(), which is
-- deliberately not the toggle pattern hat_likes uses, so Orbit Score can't
-- be farmed by like/unlike/like) and gifts, both of which build the host's
-- live_orbit_score below.
CREATE TABLE IF NOT EXISTS live_likes (
  room_id UUID NOT NULL REFERENCES live_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS live_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES live_rooms(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  gift_type TEXT NOT NULL,
  amount INT NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_live_gifts_room ON live_gifts (room_id, created_at DESC);

-- Stage reputation — separate from hats.orbit_score, which is a per-hat
-- completeness/confidence score recomputed on every save (see
-- api/_lib/orbitScore.js). live_orbit_score only ever goes up, earned from
-- likes and gifts received while live on Stage (see live.js).
ALTER TABLE users ADD COLUMN IF NOT EXISTS live_orbit_score INT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_users_live_orbit_score ON users (live_orbit_score DESC);

-- Sponsor Hall: brands renting a placement inside a Stage room. One
-- placement per room. rain_amount, if any, is distributed on the way in —
-- see live.js rentSponsorSlot() — to that room's current audience (everyone
-- who has liked or gifted it so far); there's no persistent viewer roster,
-- so that's the closest proxy for "who's watching" this can offer for now.
CREATE TABLE IF NOT EXISTS live_sponsor_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES live_rooms(id) ON DELETE CASCADE,
  sponsor_id UUID NOT NULL REFERENCES users(id),
  placement TEXT NOT NULL
    CHECK (placement IN ('led_ribbon', 'side_poster_left', 'side_poster_right', 'roof_screen', 'seats')),
  brand_name TEXT NOT NULL CHECK (char_length(btrim(brand_name)) BETWEEN 1 AND 60),
  message TEXT CHECK (message IS NULL OR char_length(message) <= 140),
  rain_amount INT NOT NULL DEFAULT 0 CHECK (rain_amount >= 0),
  amount_paid INT NOT NULL CHECK (amount_paid > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (room_id, placement)
);
CREATE INDEX IF NOT EXISTS idx_live_sponsor_slots_room ON live_sponsor_slots (room_id);

-- New wallet_transaction types for Live's money movements, on top of the
-- existing topup/escrow_fund/escrow_release/withdrawal/refund set.
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN ('topup', 'escrow_fund', 'escrow_release', 'withdrawal', 'refund',
                   'live_stake', 'live_stake_refund', 'live_prize', 'live_owner_share',
                   'live_bet_stake', 'live_bet_payout', 'live_bet_refund',
                   'live_gift_sent', 'live_gift_earning',
                   'live_sponsor_rent', 'live_sponsor_rain'));
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES live_rooms(id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_room ON wallet_transactions (room_id) WHERE room_id IS NOT NULL;
COMMIT;