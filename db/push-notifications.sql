BEGIN;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  failure_count INT NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  last_success_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  deals BOOLEAN NOT NULL DEFAULT true,
  negotiations BOOLEAN NOT NULL DEFAULT true,
  messages BOOLEAN NOT NULL DEFAULT true,
  payments BOOLEAN NOT NULL DEFAULT true,
  live BOOLEAN NOT NULL DEFAULT true,
  marketing BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_vapid_config (
  singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton = true),
  public_key TEXT NOT NULL,
  private_key_ciphertext TEXT NOT NULL,
  private_key_iv TEXT NOT NULL,
  private_key_tag TEXT NOT NULL,
  subject TEXT NOT NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
