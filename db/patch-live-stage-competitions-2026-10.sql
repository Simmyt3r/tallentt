-- Live Stage Competitions v1: viewer voting only, no wagers, stakes or wallet debits.
BEGIN;
CREATE TABLE IF NOT EXISTS stage_competitions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 5 AND 120),
 category TEXT NOT NULL CHECK (char_length(btrim(category)) BETWEEN 2 AND 80),
 description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
 status TEXT NOT NULL DEFAULT 'registration'
   CHECK (status IN ('registration','live','completed','cancelled')),
 max_contestants INT NOT NULL DEFAULT 4 CHECK (max_contestants BETWEEN 2 AND 6),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 started_at TIMESTAMPTZ,
 ended_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_stage_comp_status_created ON stage_competitions(status,created_at DESC);
CREATE TABLE IF NOT EXISTS stage_competition_entrants (
 competition_id UUID NOT NULL REFERENCES stage_competitions(id) ON DELETE CASCADE,
 talent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 stream_id UUID NOT NULL REFERENCES live_streams(id) ON DELETE RESTRICT,
 joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY (competition_id,talent_id),
 UNIQUE(competition_id,stream_id)
);
CREATE TABLE IF NOT EXISTS stage_competition_votes (
 competition_id UUID NOT NULL REFERENCES stage_competitions(id) ON DELETE CASCADE,
 voter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 talent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY (competition_id,voter_id),
 FOREIGN KEY(competition_id,talent_id)
   REFERENCES stage_competition_entrants(competition_id,talent_id) ON DELETE CASCADE,
 CHECK (voter_id <> talent_id)
);
CREATE INDEX IF NOT EXISTS idx_stage_comp_votes_result ON stage_competition_votes(competition_id,talent_id);
COMMIT;