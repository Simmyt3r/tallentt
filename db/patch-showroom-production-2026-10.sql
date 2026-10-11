-- CHOMBUTAR: Consolidated Showroom production database patch
-- Created: 2026-10-11
-- Repository: Simmyt3r/tallentt
--
-- This ONE file replaces the need to execute these five individual SQL files
-- separately against an EXISTING chombuTar PostgreSQL installation:
--   1. db/showroom-appeals.sql
--   2. db/showroom-media-screening.sql
--   3. db/showroom-admin-config.sql
--   4. db/showroom-screening-ops.sql
--   5. db/hat-media-signed-uploads.sql
--
-- REQUIRES: the existing db/schema.sql to have been installed already,
-- including users, hats, hat_media, showroom_reports, showroom_review_state.
-- BACK UP before running on production; preferably rehearse on staging.
--
-- SAFE RE-RUN: all new tables, columns and indexes use IF NOT EXISTS.
-- Existing hat_media receive screening_status='legacy', not 'pending'.
-- No DROP, TRUNCATE, DELETE, reset, wallet, escrow, or user-data changes.
-- A transaction rolls back the whole patch if any statement fails.
-- lock_timeout avoids holding up a busy production database indefinitely.
--
-- This patch only creates database structures. It DOES NOT enable media
-- screening or signed uploads; those need verified server-side configuration.
--
BEGIN;
SET LOCAL lock_timeout = '15s';

DO $chombutar_prereqs$
BEGIN
  IF to_regclass('users') IS NULL
     OR to_regclass('hats') IS NULL
     OR to_regclass('hat_media') IS NULL
     OR to_regclass('showroom_reports') IS NULL
     OR to_regclass('showroom_review_state') IS NULL THEN
    RAISE EXCEPTION
      'Missing base chombuTar schema. Apply the existing base migrations before the consolidated Showroom patch.';
  END IF;
END
$chombutar_prereqs$;

-- ================================================================
-- 1 / 5: db/showroom-appeals.sql
-- ================================================================
-- Apply after db/schema.sql on existing installations.
-- Normal Showroom listings are automatically admitted; this table handles exceptions only.
CREATE TABLE IF NOT EXISTS showroom_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hat_id UUID NOT NULL REFERENCES hats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  explanation TEXT NOT NULL CHECK (char_length(explanation) BETWEEN 15 AND 1000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolution_note TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_showroom_appeal_pending ON showroom_appeals (hat_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_showroom_appeals_queue ON showroom_appeals (created_at, id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_showroom_appeals_owner ON showroom_appeals (user_id, created_at DESC);

-- ================================================================
-- 2 / 5: db/showroom-media-screening.sql
-- ================================================================
-- Existing media retain legacy status so activation does not hide old listings.
-- Newly uploaded media are 'pending' only when screening enforcement is enabled.
ALTER TABLE hat_media ADD COLUMN IF NOT EXISTS screening_status TEXT NOT NULL DEFAULT 'legacy'
  CHECK (screening_status IN ('legacy','pending','processing','passed','held','rejected'));
ALTER TABLE hat_media ADD COLUMN IF NOT EXISTS screening_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hat_media ADD COLUMN IF NOT EXISTS screening_reason TEXT;
ALTER TABLE hat_media ADD COLUMN IF NOT EXISTS screening_checked_at TIMESTAMPTZ;
ALTER TABLE hat_media ADD COLUMN IF NOT EXISTS screening_locked_at TIMESTAMPTZ;
ALTER TABLE hat_media ADD COLUMN IF NOT EXISTS screening_lock_token UUID;
ALTER TABLE hat_media ADD COLUMN IF NOT EXISTS screening_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_hat_media_screening_queue
  ON hat_media (screening_status, screening_retry_at, created_at)
  WHERE screening_status IN ('pending','processing');
CREATE INDEX IF NOT EXISTS idx_hat_media_screening_reviews
  ON hat_media (screening_checked_at, id)
  WHERE screening_status IN ('held','rejected');
CREATE INDEX IF NOT EXISTS idx_hat_media_public_id ON hat_media (public_id);

-- ================================================================
-- 3 / 5: db/showroom-admin-config.sql
-- ================================================================
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

-- ================================================================
-- 4 / 5: db/showroom-screening-ops.sql
-- ================================================================
-- Screening operational history is server-side and intentionally excludes secrets.
CREATE TABLE IF NOT EXISTS showroom_screening_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('admin','worker')),
  triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  checked INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  held INTEGER NOT NULL DEFAULT 0,
  retried INTEGER NOT NULL DEFAULT 0,
  error_code TEXT
);
CREATE INDEX IF NOT EXISTS idx_showroom_screening_runs_recent
  ON showroom_screening_runs (started_at DESC, id DESC);

-- ================================================================
-- 5 / 5: db/hat-media-signed-uploads.sql
-- ================================================================
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

-- ================================================================
-- End of Showroom patch
-- ================================================================
COMMIT;

-- Verification summary (read-only; does not disclose secrets).
SELECT
  current_database() AS database_name,
  to_regclass('showroom_appeals') IS NOT NULL AS appeals_ready,
  to_regclass('showroom_screening_config') IS NOT NULL AS screening_settings_ready,
  to_regclass('showroom_screening_runs') IS NOT NULL AS screening_history_ready,
  to_regclass('hat_media_upload_permits') IS NOT NULL AS signed_uploads_ready,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'hat_media'
      AND column_name = 'screening_status'
  ) AS media_screening_column_ready;
