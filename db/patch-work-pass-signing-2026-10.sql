-- Server-only Work Pass signing keys. The database stores AES-GCM ciphertext,
-- never a plaintext EC private key. Historical public keys remain available
-- to verify QR claims issued before key rotation.
BEGIN;
CREATE TABLE IF NOT EXISTS work_pass_signing_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id TEXT NOT NULL UNIQUE CHECK (length(key_id) BETWEEN 8 AND 100),
  encrypted_private BYTEA NOT NULL,
  salt BYTEA NOT NULL CHECK (octet_length(salt) = 32),
  iv BYTEA NOT NULL CHECK (octet_length(iv) = 12),
  auth_tag BYTEA NOT NULL CHECK (octet_length(auth_tag) = 16),
  public_jwk JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retired_at TIMESTAMPTZ,
  CONSTRAINT signing_key_active_retired_consistency CHECK (
    (active AND retired_at IS NULL) OR (NOT active AND retired_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_pass_single_active_key
  ON work_pass_signing_keys(active) WHERE active = TRUE;
COMMIT;
