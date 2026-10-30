-- Real parent/child conversations in Hits & Vibes.
-- Apply after vibes-2026-10. All historical comments remain top-level.
BEGIN;
ALTER TABLE vibes_comments
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES vibes_comments(id) ON DELETE SET NULL;
ALTER TABLE vibes_comments
  ADD CONSTRAINT vibes_comment_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id);
CREATE INDEX IF NOT EXISTS idx_vibes_thread_roots
  ON vibes_comments (post_id,created_at DESC,id DESC)
  WHERE parent_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_vibes_thread_children
  ON vibes_comments (parent_id,created_at DESC,id DESC)
  WHERE parent_id IS NOT NULL AND deleted_at IS NULL;
COMMIT;
