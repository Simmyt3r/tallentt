-- Independent non-commercial Showroom gallery. Hat offers and escrow are unrelated.
BEGIN;
CREATE TABLE IF NOT EXISTS showroom_gallery_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_id TEXT NOT NULL,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image','video')),
  caption TEXT NOT NULL DEFAULT '' CHECK (char_length(caption) <= 500),
  moderation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending','visible','held','rejected')),
  moderation_reason TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT gallery_author_asset_unique UNIQUE (author_id, public_id)
);
CREATE INDEX IF NOT EXISTS idx_gallery_visible ON showroom_gallery_posts(created_at DESC,id DESC)
  WHERE moderation_status='visible' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_gallery_owner ON showroom_gallery_posts(author_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gallery_review ON showroom_gallery_posts(moderation_status,created_at)
  WHERE deleted_at IS NULL AND moderation_status IN ('pending','held');
CREATE TABLE IF NOT EXISTS showroom_gallery_likes (
  post_id UUID NOT NULL REFERENCES showroom_gallery_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id,user_id)
);
CREATE TABLE IF NOT EXISTS showroom_gallery_reports (
  post_id UUID NOT NULL REFERENCES showroom_gallery_posts(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('spam','unsafe','harassment','copyright','other')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id,reporter_id)
);
CREATE INDEX IF NOT EXISTS idx_gallery_reports ON showroom_gallery_reports(post_id,created_at DESC);
CREATE TABLE IF NOT EXISTS showroom_gallery_viewers (
  post_id UUID NOT NULL REFERENCES showroom_gallery_posts(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(post_id,viewer_id)
);
COMMIT;