-- Admin account erasure: durable media cleanup queue and non-PII audit.
-- Existing payment and escrow data must not be removed through user deletion.
BEGIN;
CREATE TABLE IF NOT EXISTS admin_user_media_erasure_jobs (
 id BIGSERIAL PRIMARY KEY,
 deleted_user_id UUID NOT NULL,
 public_id TEXT NOT NULL CHECK (char_length(public_id) BETWEEN 1 AND 255),
 resource_type TEXT NOT NULL CHECK (resource_type IN ('image','video','raw')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','failed')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 last_error TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE (deleted_user_id,public_id,resource_type)
);
CREATE INDEX IF NOT EXISTS idx_admin_erasure_jobs_status
 ON admin_user_media_erasure_jobs(status,created_at,id);
COMMIT;