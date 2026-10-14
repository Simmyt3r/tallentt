-- chombuTar Vibes community, additive and safe to rerun.
BEGIN;
CREATE TABLE IF NOT EXISTS vibes_posts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 body TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 500),
 media JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(media) = 'array' AND jsonb_array_length(media) <= 4),
 moderation_status TEXT NOT NULL DEFAULT 'visible' CHECK (moderation_status IN ('visible','held','removed')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 deleted_at TIMESTAMPTZ,
 CHECK (char_length(btrim(body)) > 0 OR jsonb_array_length(media) > 0)
);
CREATE INDEX IF NOT EXISTS idx_vibes_posts_feed ON vibes_posts (created_at DESC,id DESC)
 WHERE deleted_at IS NULL AND moderation_status='visible';
CREATE INDEX IF NOT EXISTS idx_vibes_posts_author ON vibes_posts (author_id,created_at DESC);
CREATE TABLE IF NOT EXISTS vibes_likes (
 post_id UUID NOT NULL REFERENCES vibes_posts(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(post_id,user_id)
);
CREATE TABLE IF NOT EXISTS vibes_comments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id UUID NOT NULL REFERENCES vibes_posts(id) ON DELETE CASCADE,
 author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 300),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_vibes_comments_post ON vibes_comments (post_id,created_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS vibes_reports (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id UUID NOT NULL REFERENCES vibes_posts(id) ON DELETE CASCADE,
 reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 reason TEXT NOT NULL CHECK (reason IN ('spam','harassment','unsafe','other')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(post_id,reporter_id)
);
CREATE INDEX IF NOT EXISTS idx_vibes_reports_created ON vibes_reports (created_at DESC);
CREATE TABLE IF NOT EXISTS vibes_upload_permits (
 id UUID PRIMARY KEY,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 public_id TEXT NOT NULL UNIQUE,
 declared_bytes INTEGER NOT NULL CHECK (declared_bytes BETWEEN 1 AND 8388608),
 declared_mime TEXT NOT NULL CHECK (declared_mime IN ('image/jpeg','image/png','image/webp')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
 claimed_post_id UUID REFERENCES vibes_posts(id) ON DELETE SET NULL,
 claimed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_vibes_uploads_owner ON vibes_upload_permits (user_id,created_at DESC);
COMMIT;
