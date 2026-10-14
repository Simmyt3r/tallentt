-- chombuTar: per-Hat Bento flier layout and private inbox cleanup.
-- Safe for existing data. Apply BEFORE deploying this feature.
BEGIN;
CREATE TABLE IF NOT EXISTS hat_presentation (
  hat_id UUID PRIMARY KEY REFERENCES hats(id) ON DELETE CASCADE,
  accent TEXT NOT NULL DEFAULT 'electric'
    CHECK (accent IN ('electric','coral','forest','violet','rose','slate','ocean','amber')),
  template TEXT NOT NULL DEFAULT 'minimal'
    CHECK (template IN ('minimal','bold','media-first','editorial','dark')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE hat_presentation
  ADD COLUMN IF NOT EXISTS bento_mode TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE hat_presentation
  ADD COLUMN IF NOT EXISTS flyer_public_id TEXT;
ALTER TABLE hat_presentation DROP CONSTRAINT IF EXISTS hat_presentation_bento_mode_check;
ALTER TABLE hat_presentation ADD CONSTRAINT hat_presentation_bento_mode_check
  CHECK (bento_mode IN ('standard', 'flyer'));
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_notifications_visible_user
  ON notifications (user_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS conversation_visibility (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  escrow_id UUID NOT NULL REFERENCES escrows(id) ON DELETE CASCADE,
  hidden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, escrow_id)
);
COMMIT;
