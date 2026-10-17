-- Vibes video uploads require signed owner-bound Cloudinary permits and manual review.
BEGIN;
ALTER TABLE vibes_upload_permits DROP CONSTRAINT IF EXISTS vibes_upload_permits_declared_bytes_check;
ALTER TABLE vibes_upload_permits ADD CONSTRAINT vibes_upload_permits_declared_bytes_check
 CHECK(declared_bytes BETWEEN 1 AND 20971520);
ALTER TABLE vibes_upload_permits DROP CONSTRAINT IF EXISTS vibes_upload_permits_declared_mime_check;
ALTER TABLE vibes_upload_permits ADD CONSTRAINT vibes_upload_permits_declared_mime_check
 CHECK(declared_mime IN ('image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'));
CREATE INDEX IF NOT EXISTS idx_vibes_posts_held_review ON vibes_posts(created_at DESC)
 WHERE moderation_status='held' AND deleted_at IS NULL;
COMMIT;