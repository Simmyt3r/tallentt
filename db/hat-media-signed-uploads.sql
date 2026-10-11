-- Server-issued upload permits bind Cloudinary public IDs to authenticated users.
-- Existing published media is not retroactively blocked by this migration.
CREATE TABLE IF NOT EXISTS hat_media_upload_permits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_id TEXT NOT NULL UNIQUE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('image','video')),
  declared_mime TEXT NOT NULL,
  declared_bytes INTEGER NOT NULL CHECK (declared_bytes > 0 AND declared_bytes <= 20971520),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
  claimed_hat_id UUID REFERENCES hats(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_hat_media_permits_user ON hat_media_upload_permits (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hat_media_permits_expiration ON hat_media_upload_permits (expires_at) WHERE claimed_at IS NULL;
