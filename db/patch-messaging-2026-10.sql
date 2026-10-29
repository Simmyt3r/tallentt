-- Apply before deploying the unified inbox API.
BEGIN;
ALTER TABLE booking_messages ADD COLUMN IF NOT EXISTS reply_to_id BIGINT REFERENCES booking_messages(id) ON DELETE SET NULL;
ALTER TABLE community_messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES community_messages(id) ON DELETE SET NULL;
ALTER TABLE community_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_community_messages_unread ON community_messages(thread_id,sender_id) WHERE read_at IS NULL;
COMMIT;
