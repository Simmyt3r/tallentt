-- Forward-only KeepUp milestones. No historical likes, follows, or points are backfilled.
-- Deploy after patch-associates-2026-10.sql and patch-orbit-review-2026-10.sql.
BEGIN;

CREATE TABLE IF NOT EXISTS orbit_milestone_events (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verb TEXT NOT NULL CHECK (verb IN ('KeepUp')),
  kind TEXT NOT NULL CHECK (kind IN ('award','reverse','restore')),
  points NUMERIC(12,1) NOT NULL,
  hats_unlocked SMALLINT NOT NULL DEFAULT 0,
  source_key TEXT NOT NULL UNIQUE,
  related_event_id BIGINT REFERENCES orbit_milestone_events(id),
  policy_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT orbit_milestone_distinct_users CHECK (actor_id<>subject_id),
  CONSTRAINT orbit_milestone_event_values CHECK (
    (kind='award' AND points=1.0 AND hats_unlocked=3 AND related_event_id IS NULL) OR
    (kind='reverse' AND points=-1.0 AND hats_unlocked=0 AND related_event_id IS NOT NULL) OR
    (kind='restore' AND points=1.0 AND hats_unlocked=0 AND related_event_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS orbit_keepup_first_award_once
  ON orbit_milestone_events(actor_id,subject_id,verb) WHERE kind='award';
CREATE INDEX IF NOT EXISTS orbit_milestone_subject_history
  ON orbit_milestone_events(subject_id,verb,id DESC);
CREATE INDEX IF NOT EXISTS orbit_milestone_pair_history
  ON orbit_milestone_events(actor_id,subject_id,verb,id DESC);

COMMIT;
