-- Screening operational history is server-side and intentionally excludes secrets.
CREATE TABLE IF NOT EXISTS showroom_screening_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('admin','worker')),
  triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  checked INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  held INTEGER NOT NULL DEFAULT 0,
  retried INTEGER NOT NULL DEFAULT 0,
  error_code TEXT
);
CREATE INDEX IF NOT EXISTS idx_showroom_screening_runs_recent
  ON showroom_screening_runs (started_at DESC, id DESC);
