BEGIN;
CREATE TABLE IF NOT EXISTS reputation_events (
 id BIGSERIAL PRIMARY KEY,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 lane TEXT NOT NULL CHECK(lane IN ('talent','employer')),
 talent TEXT NOT NULL DEFAULT '',
 source_key TEXT NOT NULL UNIQUE,
 rule_version TEXT NOT NULL DEFAULT 'v1',
 reason TEXT NOT NULL,
 points INT NOT NULL,
 reverses_id BIGINT UNIQUE REFERENCES reputation_events(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reputation_user ON reputation_events(user_id,lane,talent);
CREATE TABLE IF NOT EXISTS work_reviews (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 escrow_id UUID NOT NULL REFERENCES escrows(id),
 reviewer_id UUID NOT NULL REFERENCES users(id),
 subject_id UUID NOT NULL REFERENCES users(id),
 lane TEXT NOT NULL CHECK(lane IN ('talent','employer')),
 talent TEXT NOT NULL,
 stars INT NOT NULL CHECK(stars BETWEEN 1 AND 5),
 body TEXT NOT NULL CHECK(char_length(body) BETWEEN 1 AND 1000),
 hidden_at TIMESTAMPTZ,
 moderation_reason TEXT,
 moderated_by UUID REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(escrow_id,reviewer_id),
 CHECK(reviewer_id<>subject_id)
);
CREATE OR REPLACE FUNCTION record_work_reputation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE category_name TEXT;
BEGIN
 SELECT category INTO category_name FROM hats WHERE id=NEW.hat_id;
 IF NEW.status='secured' AND OLD.status IS DISTINCT FROM NEW.status THEN
  INSERT INTO reputation_events(user_id,lane,talent,source_key,reason,points)
  VALUES(NEW.talent_id,'talent',COALESCE(category_name,''),'funded-talent:'||NEW.id,'Escrow funded',20),
        (NEW.client_id,'employer','','funded-employer:'||NEW.id,'Funded a job',30)
  ON CONFLICT(source_key) DO NOTHING;
 END IF;
 IF NEW.status='refunded' AND OLD.status IS DISTINCT FROM NEW.status THEN
  INSERT INTO reputation_events(user_id,lane,talent,source_key,reason,points,reverses_id)
  SELECT user_id,lane,talent,'refund:'||id,'Funding reward reversed after refund',-points,id
  FROM reputation_events WHERE source_key IN ('funded-talent:'||NEW.id,'funded-employer:'||NEW.id)
  ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS work_reputation ON escrows;
CREATE TRIGGER work_reputation AFTER UPDATE OF status ON escrows FOR EACH ROW EXECUTE FUNCTION record_work_reputation();
CREATE OR REPLACE FUNCTION record_salary_reputation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE agreement employment_agreements%ROWTYPE;
BEGIN
 IF NEW.status='confirmed' AND OLD.status IS DISTINCT FROM NEW.status THEN
  SELECT * INTO agreement FROM employment_agreements WHERE id=NEW.agreement_id;
  INSERT INTO reputation_events(user_id,lane,talent,source_key,reason,points)
  VALUES(agreement.talent_id,'talent',agreement.terms->>'talent','salary-talent:'||NEW.id,'Salary receipt confirmed',30)
  ON CONFLICT(source_key) DO NOTHING;
  IF NEW.received_on<=NEW.due_on THEN
   INSERT INTO reputation_events(user_id,lane,source_key,reason,points)
   VALUES(agreement.employer_id,'employer','salary-employer:'||NEW.id,'Salary confirmed received on time',70)
   ON CONFLICT(source_key) DO NOTHING;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS salary_reputation ON employment_salary_periods;
CREATE TRIGGER salary_reputation AFTER UPDATE OF status ON employment_salary_periods FOR EACH ROW EXECUTE FUNCTION record_salary_reputation();
COMMIT;
