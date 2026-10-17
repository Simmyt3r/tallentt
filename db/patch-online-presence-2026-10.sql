BEGIN;
CREATE TABLE IF NOT EXISTS user_presence (
 user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 is_visible BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_user_presence_recent ON user_presence(last_seen) WHERE is_visible=TRUE;
COMMIT;