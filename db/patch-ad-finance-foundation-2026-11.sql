-- Release A: advertising bookkeeping only. No user balance, existing deal,
-- escrow, commission, subscription, or wallet table is altered.
-- All advertising payments and settlements remain disabled in this release.
BEGIN;

CREATE TABLE IF NOT EXISTS ad_advertisers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  legal_name TEXT NOT NULL CHECK(length(btrim(legal_name)) BETWEEN 2 AND 180),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','suspended')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ad_advertisers_owner_idx ON ad_advertisers(owner_id);

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id UUID NOT NULL REFERENCES ad_advertisers(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK(length(btrim(title)) BETWEEN 2 AND 180),
  currency TEXT NOT NULL DEFAULT 'NGN' CHECK(currency='NGN'),
  state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN
    ('draft','under_review','approved','awaiting_funding','funded','scheduled',
     'active','verifying','settled','rejected','cancelled','paused','expired','disputed','refunded')),
  target_location TEXT,
  target_work_type TEXT,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (start_at IS NULL OR end_at IS NULL OR end_at>start_at)
);
CREATE INDEX IF NOT EXISTS ad_campaigns_advertiser_idx ON ad_campaigns(advertiser_id,created_at DESC);

-- Immutable after commercial acceptance by application policy.
-- Pricing has no default: a campaign cannot silently become billable.
CREATE TABLE IF NOT EXISTS ad_campaign_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES ad_campaigns(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK(version>0),
  metric TEXT NOT NULL CHECK(metric IN
    ('verified_impression','qualified_click','profile_visit','enquiry','booking','completed_work')),
  unit_price_naira BIGINT NOT NULL CHECK(unit_price_naira>0),
  budget_cap_naira BIGINT NOT NULL CHECK(budget_cap_naira>0),
  minimum_billable_units BIGINT CHECK(minimum_billable_units>=0),
  platform_bps INTEGER NOT NULL DEFAULT 6000,
  talent_bps INTEGER NOT NULL DEFAULT 2800,
  explorer_bps INTEGER NOT NULL DEFAULT 1200,
  approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id,version),
  UNIQUE(id,campaign_id),
  CHECK(platform_bps>=0 AND talent_bps>=0 AND explorer_bps>=0
    AND platform_bps+talent_bps+explorer_bps=10000),
  CHECK(accepted_at IS NULL OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

-- Deposits are evidentiary records, NOT automatically cash collected.
-- Later integration must link a unique verified provider transaction.
CREATE TABLE IF NOT EXISTS ad_funding_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES ad_campaigns(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL,
  provider_reference TEXT NOT NULL,
  amount_naira BIGINT NOT NULL CHECK(amount_naira>0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','reversed')),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider,provider_reference),
  CHECK((status='verified' AND verified_at IS NOT NULL) OR status<>'verified')
);

-- Only a successful future verification process may create these records.
-- Store proofs, never just a client-supplied view count.
CREATE TABLE IF NOT EXISTS ad_billable_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES ad_campaigns(id) ON DELETE RESTRICT,
  terms_id UUID NOT NULL,
  event_reference TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  invalidated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id,event_reference),
  FOREIGN KEY(terms_id,campaign_id) REFERENCES ad_campaign_terms(id,campaign_id),
  CHECK(invalidated_at IS NULL OR verified_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ad_billable_events_eligible_idx
  ON ad_billable_events(campaign_id,terms_id) WHERE verified_at IS NOT NULL AND invalidated_at IS NULL;

-- This is an allocation ledger, not a wallet ledger. No payouts are created.
CREATE TABLE IF NOT EXISTS ad_campaign_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL UNIQUE REFERENCES ad_campaigns(id) ON DELETE RESTRICT,
  terms_id UUID NOT NULL,
  earned_naira BIGINT NOT NULL CHECK(earned_naira>=0),
  platform_naira BIGINT NOT NULL CHECK(platform_naira>=0),
  talent_pool_naira BIGINT NOT NULL CHECK(talent_pool_naira>=0),
  explorer_pool_naira BIGINT NOT NULL CHECK(explorer_pool_naira>=0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','verified','disputed','posted','reversed')),
  verified_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(terms_id,campaign_id) REFERENCES ad_campaign_terms(id,campaign_id),
  CHECK(earned_naira=platform_naira+talent_pool_naira+explorer_pool_naira),
  CHECK(status NOT IN ('verified','posted') OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS ad_reward_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES ad_campaign_settlements(id) ON DELETE RESTRICT,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reward_type TEXT NOT NULL CHECK(reward_type IN ('talent','explorer')),
  amount_naira BIGINT NOT NULL CHECK(amount_naira>=0),
  evidence_reference TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','held','approved','paid','reversed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(settlement_id,reward_type,recipient_id,evidence_reference)
);
CREATE INDEX IF NOT EXISTS ad_reward_allocations_settlement_idx
  ON ad_reward_allocations(settlement_id,reward_type);

-- Traceable liabilities; accounting transitions must later be made in a
-- single transaction with immutable adjustments instead of overwriting money.
CREATE TABLE IF NOT EXISTS ad_accounting_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES ad_campaigns(id) ON DELETE RESTRICT,
  account_code TEXT NOT NULL CHECK(account_code IN
    ('advertiser_deposit_liability','advertising_earned_revenue',
     'talent_payable','explorer_payable','curator_bonus_payable',
     'advertiser_refund_payable','processor_expense','platform_expense')),
  direction TEXT NOT NULL CHECK(direction IN ('debit','credit')),
  amount_naira BIGINT NOT NULL CHECK(amount_naira>0),
  entry_reference TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entry_reference,account_code,direction)
);
CREATE INDEX IF NOT EXISTS ad_accounting_entries_campaign_idx
  ON ad_accounting_entries(campaign_id,created_at DESC);

COMMIT;
