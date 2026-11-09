-- Release C: sponsored-banner inventory and owner detachment.
-- Requires Releases A and B. NO campaign is activated by this migration.
BEGIN;
ALTER TABLE ad_campaigns
  ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS ad_talent_ad_policy (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  policy_version TEXT NOT NULL CHECK(length(policy_version) BETWEEN 3 AND 40),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_hat_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES ad_campaigns(id) ON DELETE RESTRICT,
  creative_id UUID NOT NULL REFERENCES ad_creatives(id) ON DELETE RESTRICT,
  hat_id UUID NOT NULL REFERENCES hats(id) ON DELETE RESTRICT,
  state TEXT NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','active','detached','expired','cancelled')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  attached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  detached_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id,hat_id),
  CHECK(ends_at>starts_at AND ends_at<=starts_at+INTERVAL '30 days'),
  CHECK((state='detached' AND detached_at IS NOT NULL) OR (state<>'detached' AND detached_at IS NULL))
);
CREATE INDEX IF NOT EXISTS ad_hat_placements_live_idx
  ON ad_hat_placements(hat_id,starts_at,ends_at) WHERE state='active';

CREATE TABLE IF NOT EXISTS ad_placement_detachments(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id UUID NOT NULL UNIQUE REFERENCES ad_hat_placements(id) ON DELETE RESTRICT,
  talent_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT CHECK(reason IS NULL OR length(reason)<=400),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Do not introduce a live-ad default, wallet deduction, payout or billable
-- impression counter in this migration. Advertisements remain ineligible to
-- display until explicitly enabled and fully funded in a future release.
COMMIT;
