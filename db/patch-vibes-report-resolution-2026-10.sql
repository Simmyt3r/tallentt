-- Preserve user report evidence after an administrator resolves a case.
-- This migration is additive and retains all historic report records.
BEGIN;
ALTER TABLE vibes_reports ADD COLUMN IF NOT EXISTS resolution TEXT NOT NULL DEFAULT 'open';
ALTER TABLE vibes_reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE vibes_reports ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE vibes_reports DROP CONSTRAINT IF EXISTS vibes_reports_resolution_check;
ALTER TABLE vibes_reports ADD CONSTRAINT vibes_reports_resolution_check
  CHECK(resolution IN ('open','dismissed','actioned'));
CREATE INDEX IF NOT EXISTS idx_vibes_reports_open
  ON vibes_reports(post_id,created_at DESC) WHERE resolution='open';
COMMIT;
