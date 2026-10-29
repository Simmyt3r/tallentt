BEGIN;
CREATE TABLE IF NOT EXISTS employment_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  talent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending','active','declined','withdrawn','ended')),
  version INT NOT NULL DEFAULT 1 CHECK (version > 0),
  terms JSONB NOT NULL CHECK (jsonb_typeof(terms)='object'),
  employer_accepted_at TIMESTAMPTZ,
  talent_accepted_at TIMESTAMPTZ,
  accepted_version INT,
  ended_on DATE,
  publish_status BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (employer_id <> talent_id),
  CHECK (status NOT IN ('active','ended') OR (employer_accepted_at IS NOT NULL AND talent_accepted_at IS NOT NULL AND accepted_version IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_employment_employer ON employment_agreements(employer_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_employment_talent ON employment_agreements(talent_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS employment_salary_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES employment_agreements(id) ON DELETE CASCADE,
  month TEXT NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  due_on DATE NOT NULL,
  paid_on DATE NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('bank_transfer','cash','escrow')),
  escrow_id UUID REFERENCES escrows(id),
  status TEXT NOT NULL DEFAULT 'reported' CHECK (status IN ('reported','disputed','confirmed')),
  revision INT NOT NULL DEFAULT 1 CHECK (revision > 0),
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  received_on DATE,
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note)<=1000),
  UNIQUE (agreement_id,month),
  CHECK ((method='escrow') = (escrow_id IS NOT NULL)),
  CHECK ((status='confirmed') = (confirmed_at IS NOT NULL AND received_on IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_employment_salary_escrow ON employment_salary_periods(escrow_id) WHERE escrow_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS employment_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES employment_agreements(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('message','event')),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  reply_to_id UUID REFERENCES employment_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_employment_messages ON employment_messages(agreement_id,created_at,id);
CREATE INDEX IF NOT EXISTS idx_employment_unread ON employment_messages(agreement_id,sender_id) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS employment_events (
  id BIGSERIAL PRIMARY KEY,
  agreement_id UUID NOT NULL REFERENCES employment_agreements(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_employment_events ON employment_events(agreement_id,id);
CREATE TABLE IF NOT EXISTS employment_commands (
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  command_id UUID NOT NULL,
  request_hash TEXT NOT NULL,
  result JSONB NOT NULL,
  PRIMARY KEY (actor_id,command_id)
);
COMMIT;
