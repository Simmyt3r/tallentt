-- Salary is a per-employment-month service paid separately by both participants.
-- Gig fees are booked when a new deal is sealed and adjusted on refunds.
BEGIN;
CREATE TABLE IF NOT EXISTS salary_tracking_prices (
  method TEXT PRIMARY KEY CHECK (method IN ('bank_transfer','cash','escrow')),
  fee_naira INTEGER CHECK (fee_naira IS NULL OR fee_naira BETWEEN 1 AND 2000000),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO salary_tracking_prices(method,fee_naira) VALUES
 ('bank_transfer',1000),('cash',500),('escrow',NULL)
ON CONFLICT (method) DO NOTHING;
CREATE TABLE IF NOT EXISTS salary_tracking_contributions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 period_id UUID NOT NULL REFERENCES employment_salary_periods(id) ON DELETE CASCADE,
 side TEXT NOT NULL CHECK (side IN ('client','talent')),
 payer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 amount INTEGER NOT NULL CHECK (amount > 0),
 reference TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','refunded')),
 paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 refunded_at TIMESTAMPTZ,
 UNIQUE(period_id,side)
);
CREATE INDEX IF NOT EXISTS salary_tracking_contributions_payer ON salary_tracking_contributions(payer_id,paid_at DESC);

ALTER TABLE billing_charge_events DROP CONSTRAINT IF EXISTS billing_charge_events_kind_check;
ALTER TABLE billing_charge_events ADD CONSTRAINT billing_charge_events_kind_check
 CHECK(kind IN ('salary_tracking','salary_tracking_talent','business_verification','subscription'));

ALTER TABLE escrows ADD COLUMN IF NOT EXISTS gig_fee_sealed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE gig_fee_events DROP CONSTRAINT IF EXISTS gig_fee_events_stage_check;
ALTER TABLE gig_fee_events ADD CONSTRAINT gig_fee_events_stage_check
 CHECK(stage IN ('sealed','start','completion','dispute_release'));
CREATE TABLE IF NOT EXISTS gig_commission_adjustments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 escrow_id UUID NOT NULL UNIQUE REFERENCES escrows(id) ON DELETE RESTRICT,
 refunded_gross INTEGER NOT NULL CHECK(refunded_gross >= 0),
 commission_reversed INTEGER NOT NULL CHECK(commission_reversed>=0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMIT;