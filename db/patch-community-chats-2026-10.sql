-- Opt-in community direct chat: one request is allowed before recipient accepts.
-- Deal messages, payments, and escrow permissions remain completely separate.
BEGIN;
CREATE TABLE IF NOT EXISTS community_threads (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 initiator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'pending'
  CHECK(status IN ('pending','accepted','declined','blocked')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(initiator_id<>recipient_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_community_members ON community_threads(
 LEAST(initiator_id,recipient_id),GREATEST(initiator_id,recipient_id));
CREATE INDEX IF NOT EXISTS idx_community_initiator ON community_threads(initiator_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_recipient ON community_threads(recipient_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS community_messages (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 thread_id UUID NOT NULL REFERENCES community_threads(id) ON DELETE CASCADE,
 sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 body TEXT NOT NULL CHECK(char_length(btrim(body)) BETWEEN 1 AND 2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_community_messages_thread ON community_messages(thread_id,created_at DESC,id DESC);
COMMIT;
