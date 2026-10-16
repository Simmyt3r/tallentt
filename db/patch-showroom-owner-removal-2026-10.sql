-- Remove a Hat's Showroom entry without deleting the Hat or existing deals.
BEGIN;
CREATE TABLE IF NOT EXISTS showroom_hidden_hats (
  hat_id UUID PRIMARY KEY REFERENCES hats(id) ON DELETE CASCADE,
  hidden_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hidden_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMIT;
