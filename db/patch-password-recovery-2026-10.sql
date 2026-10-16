-- ChombuTar account recovery: short-lived, one-use reset tokens and abuse throttling.
BEGIN;
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_owner ON password_reset_tokens(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS password_reset_attempts (
  id BIGSERIAL PRIMARY KEY,
  ip_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS password_reset_attempts_rate ON password_reset_attempts(ip_hash, created_at DESC);
COMMIT;
