-- Separate professional statement, Hat tagline and detailed job requirements.
-- Additive; existing values remain unchanged and public phone privacy remains unchanged.
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_statement TEXT;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_profile_statement_length_check;
ALTER TABLE users ADD CONSTRAINT users_profile_statement_length_check
  CHECK(profile_statement IS NULL OR char_length(profile_statement) <= 2000);
ALTER TABLE hats ADD COLUMN IF NOT EXISTS job_requirements TEXT;
ALTER TABLE hats DROP CONSTRAINT IF EXISTS hats_job_requirements_length_check;
ALTER TABLE hats ADD CONSTRAINT hats_job_requirements_length_check
  CHECK(job_requirements IS NULL OR char_length(job_requirements) <= 3000);
COMMIT;
