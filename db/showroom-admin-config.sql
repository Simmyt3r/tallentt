-- Database-backed runtime Showroom screening settings. Secrets are encrypted in the API.
-- The root encryption key remains server-side (SHOWROOM_CONFIG_ENCRYPTION_KEY or JWT_SECRET).
CREATE TABLE IF NOT EXISTS showroom_screening_config (
 singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton = true),
 cloud_name TEXT,
 vision_key_encrypted TEXT,
 worker_secret_encrypted TEXT,
 enabled BOOLEAN,
 updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
