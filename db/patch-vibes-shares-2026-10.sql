-- Share counters record completed user-initiated share/copy actions.
-- At most one per signed-in member and Vibe per UTC day, preventing rapid
-- repeated taps from inflating the public engagement count.
-- Apply after vibes-2026-10; existing Vibe posts and likes are unaffected.
BEGIN;
CREATE TABLE IF NOT EXISTS vibes_shares (
 post_id UUID NOT NULL REFERENCES vibes_posts(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 shared_on DATE NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date),
 method TEXT NOT NULL CHECK (method IN ('native','link')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(post_id,user_id,shared_on)
);
CREATE INDEX IF NOT EXISTS idx_vibes_shares_post ON vibes_shares(post_id);
COMMIT;
