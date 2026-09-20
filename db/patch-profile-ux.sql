-- Path: db/patch-profile-ux.sql
-- Run this once against an existing database to add the Profile UX
-- upgrade's identity fields that schema.sql now defines for fresh
-- installs (headline, skills, industry, company_suffix, website). Safe
-- to re-run. Identical to the block already folded into schema.sql.

ALTER TABLE users ADD COLUMN IF NOT EXISTS headline TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS skills TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS industry TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_suffix TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS website TEXT;
UPDATE users SET skills = '{}' WHERE skills IS NULL;
UPDATE users SET industry = '{}' WHERE industry IS NULL;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_headline_length_check;
ALTER TABLE users ADD CONSTRAINT users_headline_length_check CHECK (headline IS NULL OR char_length(headline) <= 80);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_website_length_check;
ALTER TABLE users ADD CONSTRAINT users_website_length_check CHECK (website IS NULL OR char_length(website) <= 300);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_company_suffix_check;
ALTER TABLE users ADD CONSTRAINT users_company_suffix_check
  CHECK (company_suffix IS NULL OR company_suffix IN ('Ltd.', 'Limited', 'Inc.', 'LLC', 'PLC', 'LLP', 'Corp.'));
