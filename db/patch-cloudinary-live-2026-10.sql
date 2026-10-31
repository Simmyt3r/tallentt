-- Apply AFTER db/live-support.sql. Provider credentials never enter Postgres.
BEGIN;
ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS cloudinary_stream_id TEXT;
ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS cloudinary_hls_url TEXT;
ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS cloudinary_checked_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS idx_live_cloudinary_stream_id ON live_streams(cloudinary_stream_id) WHERE cloudinary_stream_id IS NOT NULL;
ALTER TABLE live_streams DROP CONSTRAINT IF EXISTS live_streams_cloudinary_stream_id_check;
ALTER TABLE live_streams ADD CONSTRAINT live_streams_cloudinary_stream_id_check
  CHECK(cloudinary_stream_id IS NULL OR cloudinary_stream_id ~ '^[A-Za-z0-9_-]{10,128}$');
COMMIT;
