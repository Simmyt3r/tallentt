-- ChombuTar full schema v5.1
-- Safe for fresh installs and existing Neon databases.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('talent', 'client', 'dual')) DEFAULT 'dual',
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

UPDATE users SET role = 'talent' WHERE role = 'creator';
UPDATE users SET role = 'client' WHERE role = 'employer';

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nin_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nin_last4 TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS paystack_recipient_code TEXT;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('talent', 'client', 'dual'));

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nin_hash ON users (nin_hash) WHERE nin_hash IS NOT NULL;

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
ALTER TABLE escrows ADD CONSTRAINT escrows_status_check CHECK (status IN ('not_funded','secured','released','cancelled'));
CREATE INDEX IF NOT EXISTS idx_escrows_client ON escrows (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_escrows_talent ON escrows (talent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_escrows_hat ON escrows (hat_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_escrows_payment_reference ON escrows (payment_reference) WHERE payment_reference IS NOT NULL;

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
