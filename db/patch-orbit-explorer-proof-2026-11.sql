-- Step 3: forward-only Explorer credit and auditable Discovery small proofs.
-- Admin prerequisite: associates-2026-10, orbit-milestones-2026-11,
-- orbit-verified-2026-11. No historical reward backfill and no money movement.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.orbit_verified_events') IS NULL OR
     to_regclass('public.orbit_discovery_sessions') IS NULL
  THEN RAISE EXCEPTION 'Apply orbit-verified-2026-11 before Orbit Explorer & Proof.';
  END IF;
END $$;

-- Explorer is a Discoverer's mirror bonus, NOT an eighth commercial verb.
-- It shares the same qualified Discovery session as the Talent award.
ALTER TABLE orbit_verified_events
  DROP CONSTRAINT IF EXISTS orbit_verified_events_verb_check;
ALTER TABLE orbit_verified_events
  ADD CONSTRAINT orbit_verified_events_verb_check
  CHECK (verb IN ('Showcase','Discover','Explorer','Book','Collab','Hire','Sponsor'));
CREATE UNIQUE INDEX IF NOT EXISTS orbit_explorer_first_pair
  ON orbit_verified_events(actor_id,subject_id) WHERE verb='Explorer';

ALTER TABLE orbit_discovery_sessions
  DROP CONSTRAINT IF EXISTS orbit_discovery_sessions_proof_kind_check;
ALTER TABLE orbit_discovery_sessions
  ADD CONSTRAINT orbit_discovery_sessions_proof_kind_check
  CHECK (proof_kind IN ('hat_like','keepup','second_hat','save','share','second_media'));

-- A Save is a durable subscriber-owned action, unlike passive page views.
-- It can be removed. A deleted Save cannot qualify a new Discovery.
CREATE TABLE IF NOT EXISTS orbit_saved_hats (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hat_id UUID NOT NULL REFERENCES hats(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id,hat_id)
);
CREATE INDEX IF NOT EXISTS orbit_saved_hats_reverse ON orbit_saved_hats(hat_id,created_at DESC);

-- Only explicit share/copy and selection of a second approved media asset
-- after a signed-in Discovery session are stored as proof candidates.
-- This ledger is not a verified external-share analytics counter.
CREATE TABLE IF NOT EXISTS orbit_discovery_proof_events (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES orbit_discovery_sessions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('share','second_media')),
  media_id UUID REFERENCES hat_media(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id,kind),
  CONSTRAINT orbit_discovery_proof_media CHECK (
    (kind='share' AND media_id IS NULL) OR
    (kind='second_media' AND media_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS orbit_discovery_proofs_session
  ON orbit_discovery_proof_events(session_id,kind);

COMMIT;
