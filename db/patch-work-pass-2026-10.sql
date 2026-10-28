-- Work Pass: evidence is linked to a completed escrow and approved by its client.
-- A camera capture is a UX provenance control, NOT cryptographic proof of when it was taken.
BEGIN;
CREATE TABLE IF NOT EXISTS work_pass_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_id UUID NOT NULL UNIQUE REFERENCES escrows(id),
  talent_id UUID NOT NULL REFERENCES users(id),
  client_id UUID NOT NULL REFERENCES users(id),
  media_upload_id UUID NOT NULL UNIQUE,
  public_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  image_sha256 TEXT NOT NULL CHECK (image_sha256 ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  client_note TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  CONSTRAINT work_pass_image_url_https CHECK (image_url LIKE 'https://%')
);
CREATE INDEX IF NOT EXISTS idx_work_pass_evidence_talent ON work_pass_evidence(talent_id, status, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_pass_evidence_client ON work_pass_evidence(client_id, status);
CREATE TABLE IF NOT EXISTS work_pass_robots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id),
  manufacturer TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  display_name TEXT NOT NULL,
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  photo_url TEXT,
  manufacturer_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(manufacturer, serial_number),
  CONSTRAINT robot_identity_sizes CHECK (length(manufacturer) BETWEEN 2 AND 80 AND length(serial_number) BETWEEN 3 AND 120)
);
CREATE INDEX IF NOT EXISTS idx_work_pass_robots_owner ON work_pass_robots(owner_id);
CREATE TABLE IF NOT EXISTS work_pass_issuers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  website TEXT,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS work_pass_endorsements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_id UUID NOT NULL REFERENCES work_pass_issuers(id),
  subject_id UUID REFERENCES users(id),
  robot_id UUID REFERENCES work_pass_robots(id),
  statement TEXT NOT NULL,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT endorsement_one_subject CHECK ((subject_id IS NOT NULL) <> (robot_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_work_pass_endorsements_subject ON work_pass_endorsements(subject_id, approved_at);
COMMIT;
