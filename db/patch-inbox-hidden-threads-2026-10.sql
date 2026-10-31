-- A subscriber may hide an individual chat without erasing work, employment,
-- read receipts, audit records or the other participant's history.
BEGIN;
CREATE TABLE IF NOT EXISTS inbox_hidden_threads (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('associates','employment')),
  thread_id UUID NOT NULL,
  hidden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id,kind,thread_id)
);
CREATE INDEX IF NOT EXISTS idx_inbox_hidden_threads_user
  ON inbox_hidden_threads(user_id,kind,hidden_at);
COMMIT;
