-- ChombuTar approved pricing (October 2026). Admin > Database Migrations.
-- Existing escrow agreements retain their original terms: NULL fee_bps
-- means no newly introduced gig commission is charged retroactively.
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_business_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS gig_fee_bps INTEGER
  CHECK (gig_fee_bps IS NULL OR gig_fee_bps BETWEEN 0 AND 10000);

CREATE TABLE IF NOT EXISTS gig_fee_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_id UUID NOT NULL REFERENCES escrows(id) ON DELETE RESTRICT,
  stage TEXT NOT NULL CHECK(stage IN ('start','completion','dispute_release')),
  gross_released INTEGER NOT NULL CHECK(gross_released > 0),
  fee_amount INTEGER NOT NULL CHECK(fee_amount >= 0 AND fee_amount <= gross_released),
  rate_bps INTEGER NOT NULL CHECK(rate_bps BETWEEN 0 AND 10000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (escrow_id,stage)
);
CREATE INDEX IF NOT EXISTS idx_gig_fees_recent ON gig_fee_events(created_at DESC);

-- Reporting and plan catalogs are not subscriptions until purchased.
CREATE TABLE IF NOT EXISTS billing_plan_prices (
  audience TEXT NOT NULL CHECK (audience IN ('talent','client')),
  plan_code TEXT NOT NULL,
  monthly_naira INTEGER CHECK(monthly_naira > 0),
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(audience,plan_code),
  CHECK ((audience='talent' AND plan_code IN ('green_pro','black_vaulted'))
    OR (audience='client' AND plan_code IN ('business','enterprise')))
);
INSERT INTO billing_plan_prices(audience,plan_code) VALUES
  ('talent','green_pro'),('talent','black_vaulted'),
  ('client','business'),('client','enterprise')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS account_paid_plans (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  audience TEXT NOT NULL CHECK(audience IN ('talent','client')),
  plan_code TEXT NOT NULL,
  amount_paid INTEGER NOT NULL CHECK(amount_paid > 0),
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  payment_reference TEXT NOT NULL UNIQUE,
  PRIMARY KEY(user_id,audience,purchased_at)
);
CREATE INDEX IF NOT EXISTS idx_account_paid_plans_current ON account_paid_plans(user_id,audience,expires_at DESC);

CREATE TABLE IF NOT EXISTS billing_charge_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('salary_tracking','business_verification','subscription')),
  source_id UUID NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0),
  reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'charged' CHECK(status IN ('charged','refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  refunded_at TIMESTAMPTZ,
  UNIQUE(kind,source_id)
);
CREATE INDEX IF NOT EXISTS idx_billing_charge_recent ON billing_charge_events(created_at DESC);

CREATE TABLE IF NOT EXISTS business_verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  legal_name TEXT NOT NULL CHECK(length(btrim(legal_name)) BETWEEN 2 AND 180),
  registration_number TEXT NOT NULL CHECK(length(btrim(registration_number)) BETWEEN 4 AND 64),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  review_note TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  charge_event_id UUID UNIQUE REFERENCES billing_charge_events(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bv_pending ON business_verification_requests(user_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_bv_review ON business_verification_requests(status,requested_at);

ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check CHECK(type IN (
  'topup','escrow_fund','escrow_start','escrow_release','withdrawal','refund',
  'live_stake','live_stake_refund','live_prize','live_owner_share','live_bet_stake','live_bet_payout','live_bet_refund',
  'live_gift_sent','live_gift_earning','live_sponsor_rent','live_sponsor_rain','live_support_sent','live_support_earning',
  'billing_charge','billing_refund'));
COMMIT;
