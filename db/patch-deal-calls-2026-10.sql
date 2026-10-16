-- Deals Chat voice/video calls: ephemeral peer-to-peer WebRTC signaling.
-- Call signaling is never a booking offer, escrow transfer or wallet transaction.
BEGIN;
CREATE TABLE IF NOT EXISTS deal_calls (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 escrow_id UUID NOT NULL REFERENCES escrows(id) ON DELETE CASCADE,
 caller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 callee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 mode TEXT NOT NULL CHECK (mode IN ('audio','video')),
 status TEXT NOT NULL DEFAULT 'ringing'
   CHECK (status IN ('ringing','accepted','declined','ended','expired')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 accepted_at TIMESTAMPTZ,
 ended_at TIMESTAMPTZ,
 expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW()+INTERVAL '60 seconds'),
 CHECK (caller_id <> callee_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_deal_calls_active ON deal_calls(escrow_id)
 WHERE status IN ('ringing','accepted');
CREATE INDEX IF NOT EXISTS idx_deal_calls_cleanup ON deal_calls(expires_at,status);
CREATE INDEX IF NOT EXISTS idx_deal_calls_user ON deal_calls(caller_id,created_at DESC);
CREATE TABLE IF NOT EXISTS deal_call_signals (
 id BIGSERIAL PRIMARY KEY,
 call_id UUID NOT NULL REFERENCES deal_calls(id) ON DELETE CASCADE,
 sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK (kind IN ('offer','answer','ice')),
 payload JSONB NOT NULL CHECK (jsonb_typeof(payload)='object'
   AND octet_length(payload::text) <= 20000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deal_call_signals ON deal_call_signals(call_id,id);
COMMIT;