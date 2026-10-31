-- Independent privacy policies for new Showroom hiring requests and Vibes comments.
-- No existing booking, employment conversation or recorded comment is deleted.
BEGIN;
CREATE TABLE IF NOT EXISTS subscriber_content_privacy (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  showroom_inquiries TEXT NOT NULL DEFAULT 'everyone'
    CHECK (showroom_inquiries IN ('everyone','verified_clients','nobody')),
  vibes_comments TEXT NOT NULL DEFAULT 'everyone'
    CHECK (vibes_comments IN ('everyone','associates','nobody')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMIT;
