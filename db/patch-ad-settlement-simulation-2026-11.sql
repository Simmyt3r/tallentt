-- Release D2: simulation-only accounting preflight and review audit.
-- Apply AFTER advertising A, B, C migrations. No money is booked or moved.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.ad_campaigns') IS NULL
     OR to_regclass('public.ad_hat_placements') IS NULL
     OR to_regclass('public.ad_campaign_terms') IS NULL
  THEN
    RAISE EXCEPTION 'Apply advertising financial foundation, campaign management and sponsored slots before settlement simulation.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ad_settlement_simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES ad_campaigns(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision BETWEEN 1 AND 1000000),
  fingerprint TEXT NOT NULL CHECK(fingerprint ~ '^[0-9a-f]{64}$'),
  policy_version TEXT NOT NULL CHECK(length(policy_version) BETWEEN 3 AND 100),
  preview_snapshot JSONB NOT NULL CHECK(jsonb_typeof(preview_snapshot)='object'),
  blockers JSONB NOT NULL CHECK(jsonb_typeof(blockers)='array'),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id,revision),
  UNIQUE(campaign_id,fingerprint)
);
CREATE INDEX IF NOT EXISTS ad_settlement_simulations_campaign_idx
  ON ad_settlement_simulations(campaign_id,created_at DESC);

CREATE TABLE IF NOT EXISTS ad_settlement_simulation_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id UUID NOT NULL REFERENCES ad_settlement_simulations(id) ON DELETE RESTRICT,
  ledger_kind TEXT NOT NULL CHECK(ledger_kind IN ('platform','talent','explorer','unallocated_talent','unallocated_explorer')),
  recipient_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  evidence_reference TEXT NOT NULL CHECK(length(evidence_reference) BETWEEN 2 AND 150),
  amount_naira BIGINT NOT NULL CHECK(amount_naira>=0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(simulation_id,ledger_kind,evidence_reference),
  CHECK ((ledger_kind IN ('platform','unallocated_talent','unallocated_explorer') AND recipient_id IS NULL)
    OR (ledger_kind IN ('talent','explorer') AND recipient_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ad_settlement_simulation_lines_report_idx
  ON ad_settlement_simulation_lines(simulation_id,ledger_kind);

-- Review decisions are append-only case notes. None authorizes a payment.
CREATE TABLE IF NOT EXISTS ad_settlement_simulation_reviews (
  id BIGSERIAL PRIMARY KEY,
  simulation_id UUID NOT NULL REFERENCES ad_settlement_simulations(id) ON DELETE RESTRICT,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK(action IN ('hold','dispute','reviewed_for_testing')),
  note TEXT NOT NULL CHECK(length(btrim(note)) BETWEEN 12 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ad_settlement_simulation_reviews_idx
  ON ad_settlement_simulation_reviews(simulation_id,id DESC);

-- Simulated snapshots, lines and review notes cannot be silently rewritten.
CREATE OR REPLACE FUNCTION ad_simulation_deny_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Advertising simulation audit entries are append-only';
END $$;
DROP TRIGGER IF EXISTS ad_simulation_runs_immutable ON ad_settlement_simulations;
CREATE TRIGGER ad_simulation_runs_immutable BEFORE UPDATE OR DELETE
  ON ad_settlement_simulations FOR EACH ROW EXECUTE FUNCTION ad_simulation_deny_mutation();
DROP TRIGGER IF EXISTS ad_simulation_lines_immutable ON ad_settlement_simulation_lines;
CREATE TRIGGER ad_simulation_lines_immutable BEFORE UPDATE OR DELETE
  ON ad_settlement_simulation_lines FOR EACH ROW EXECUTE FUNCTION ad_simulation_deny_mutation();
DROP TRIGGER IF EXISTS ad_simulation_reviews_immutable ON ad_settlement_simulation_reviews;
CREATE TRIGGER ad_simulation_reviews_immutable BEFORE UPDATE OR DELETE
  ON ad_settlement_simulation_reviews FOR EACH ROW EXECUTE FUNCTION ad_simulation_deny_mutation();

COMMIT;
