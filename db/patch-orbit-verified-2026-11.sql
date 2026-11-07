-- Account-governed, forward-only milestone evidence, appeals, and Hat capacity.
-- Apply AFTER associates-2026-10 and orbit-milestones-2026-11.
-- No historical work, payments, followers or virtual points are fabricated.
BEGIN;

CREATE TABLE IF NOT EXISTS orbit_verified_events (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  beneficiary_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lane TEXT NOT NULL CHECK(lane IN ('talent','client')),
  verb TEXT NOT NULL CHECK(verb IN ('Showcase','Discover','Book','Collab','Hire','Sponsor')),
  source_type TEXT NOT NULL CHECK(source_type IN ('hat','discovery','escrow','employment','wallet_transfer')),
  source_id UUID NOT NULL,
  points NUMERIC(14,1) NOT NULL CHECK(points IN (0.1,1,3,5,10)),
  hats_unlocked SMALLINT NOT NULL DEFAULT 0 CHECK(hats_unlocked BETWEEN 0 AND 10),
  status TEXT NOT NULL DEFAULT 'verified' CHECK(status IN ('verified','revoked')),
  policy_version SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(verb,beneficiary_id,source_type,source_id),
  CONSTRAINT orbit_verified_self_guard CHECK(actor_id<>subject_id OR verb='Showcase')
);
CREATE UNIQUE INDEX IF NOT EXISTS orbit_discovery_first_pair
  ON orbit_verified_events(actor_id,subject_id) WHERE verb='Discover';
CREATE INDEX IF NOT EXISTS orbit_verified_beneficiary
  ON orbit_verified_events(beneficiary_id,status,verb,id DESC);
CREATE INDEX IF NOT EXISTS orbit_verified_pair
  ON orbit_verified_events(actor_id,subject_id,verb,id DESC);

CREATE TABLE IF NOT EXISTS orbit_discovery_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  talent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hat_id UUID NOT NULL REFERENCES hats(id) ON DELETE CASCADE,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW()+INTERVAL '10 minutes'),
  first_heartbeat_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  heartbeat_count SMALLINT NOT NULL DEFAULT 0 CHECK(heartbeat_count BETWEEN 0 AND 20),
  proof_kind TEXT CHECK(proof_kind IN ('hat_like','keepup','second_hat')),
  state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','awarded','held','rejected')),
  fraud_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT orbit_discovery_distinct CHECK(viewer_id<>talent_id),
  CONSTRAINT orbit_discovery_valid_expiry CHECK(expires_at>opened_at)
);
CREATE INDEX IF NOT EXISTS orbit_discovery_actor_rate
  ON orbit_discovery_sessions(viewer_id,opened_at DESC);
CREATE INDEX IF NOT EXISTS orbit_discovery_talent_queue
  ON orbit_discovery_sessions(state,talent_id,opened_at DESC);
CREATE INDEX IF NOT EXISTS orbit_discovery_actor_pair
  ON orbit_discovery_sessions(viewer_id,talent_id,opened_at DESC);

CREATE TABLE IF NOT EXISTS orbit_discovery_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES orbit_discovery_sessions(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  explanation TEXT NOT NULL CHECK(char_length(btrim(explanation)) BETWEEN 20 AND 1000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','denied')),
  admin_id UUID REFERENCES users(id),
  admin_note TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id,submitted_by)
);
CREATE INDEX IF NOT EXISTS orbit_discovery_appeals_review
  ON orbit_discovery_appeals(status,created_at);

CREATE TABLE IF NOT EXISTS orbit_seals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verb TEXT NOT NULL CHECK(verb IN ('Collab','Hire','Sponsor')),
  source_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  talent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_signed_at TIMESTAMPTZ,
  talent_signed_at TIMESTAMPTZ,
  sealed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sealed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(verb,source_id),
  CONSTRAINT orbit_seal_participants CHECK(client_id<>talent_id),
  CONSTRAINT orbit_seal_creator CHECK(created_by IN(client_id,talent_id)),
  CONSTRAINT orbit_seal_complete CHECK(status<>'sealed' OR
      (client_signed_at IS NOT NULL AND talent_signed_at IS NOT NULL AND sealed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS orbit_seals_talent ON orbit_seals(talent_id,created_at DESC);
CREATE INDEX IF NOT EXISTS orbit_seals_client ON orbit_seals(client_id,created_at DESC);

CREATE TABLE IF NOT EXISTS orbit_milestone_decisions (
  id BIGSERIAL PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES users(id),
  event_id BIGINT REFERENCES orbit_verified_events(id),
  discovery_session_id UUID REFERENCES orbit_discovery_sessions(id),
  action TEXT NOT NULL CHECK(action IN ('discovery_approve','discovery_reject','revoke_award')),
  reason TEXT NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 12 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT orbit_decision_target CHECK ((event_id IS NULL) <> (discovery_session_id IS NULL))
);

CREATE TABLE IF NOT EXISTS orbit_hat_allowances (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  baseline_slots INT NOT NULL CHECK(baseline_slots >= 10),
  established_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Preserve users already over 10. This is a quota baseline, NOT a historical
-- points award or a claim that old Hats were milestone-qualified.
INSERT INTO orbit_hat_allowances(user_id,baseline_slots)
SELECT u.id,GREATEST(10,COUNT(h.id)::int)
FROM users u LEFT JOIN hats h ON h.user_id=u.id
GROUP BY u.id ON CONFLICT(user_id) DO NOTHING;

COMMIT;
