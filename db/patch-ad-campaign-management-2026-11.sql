-- Release B: advertiser onboarding and editorial campaign approval only.
-- Requires patch-ad-finance-foundation-2026-11.sql.
-- Does not enable billing, paid activation or wallet mutations.
BEGIN;
ALTER TABLE ad_advertisers ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS request_key UUID;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS review_note TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ad_campaigns_idempotency_idx
  ON ad_campaigns(advertiser_id,request_key) WHERE request_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ad_advertisers_owner_name_idx
  ON ad_advertisers(owner_id,lower(btrim(legal_name)));
CREATE TABLE IF NOT EXISTS ad_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES ad_campaigns(id) ON DELETE RESTRICT,
  media_type TEXT NOT NULL CHECK(media_type IN ('image','video')),
  media_url TEXT NOT NULL CHECK(length(media_url) BETWEEN 20 AND 2048),
  caption TEXT NOT NULL DEFAULT '' CHECK(length(caption)<=300),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','rejected')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id,media_url)
);
CREATE INDEX IF NOT EXISTS ad_creatives_review_idx
  ON ad_creatives(state,created_at DESC);

CREATE TABLE IF NOT EXISTS ad_review_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type TEXT NOT NULL CHECK(object_type IN ('advertiser','campaign','creative')),
  object_id UUID NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('submitted','approved','rejected','resubmitted')),
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  note TEXT NOT NULL DEFAULT '' CHECK(length(note)<=1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ad_review_history_object_idx
  ON ad_review_history(object_type,object_id,created_at DESC);
COMMIT;
