-- Mutual professional Associates, one-way subscribers and privacy.
-- Two distinct concepts. No escrow or chat transaction tables are altered.
BEGIN;

CREATE TABLE IF NOT EXISTS associate_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  who_can_request TEXT NOT NULL DEFAULT 'everyone'
    CHECK (who_can_request IN ('everyone','verified_talents','nobody'))
);

CREATE TABLE IF NOT EXISTS associate_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_low UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_high UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','accepted','declined','blocked','removed')),
  vouched_by_low BOOLEAN NOT NULL DEFAULT FALSE,
  vouched_by_high BOOLEAN NOT NULL DEFAULT FALSE,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT associate_distinct_members CHECK(member_low < member_high),
  CONSTRAINT associate_requester_member CHECK(requester_id IN (member_low,member_high)),
  CONSTRAINT associate_pair UNIQUE(member_low,member_high)
);
CREATE INDEX IF NOT EXISTS associate_links_low ON associate_links(member_low,status,accepted_at DESC);
CREATE INDEX IF NOT EXISTS associate_links_high ON associate_links(member_high,status,accepted_at DESC);
CREATE INDEX IF NOT EXISTS associate_links_requests ON associate_links(requester_id,created_at DESC);

CREATE TABLE IF NOT EXISTS subscriber_follows (
  follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followed_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(follower_id,followed_id),
  CONSTRAINT subscriber_not_self CHECK(follower_id<>followed_id)
);
CREATE INDEX IF NOT EXISTS subscriber_follows_followed ON subscriber_follows(followed_id,created_at DESC);

COMMIT;
