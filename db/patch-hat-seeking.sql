-- "Seeking" (Talent) / "Hiring" (Client) — what a Hat is for, e.g. "Wedding
-- photographer" — is now its own value, separate from hat_title (the name the
-- owner gives the Hat). Hats created before this carried both in hat_title, so
-- they start with the same text in both; the owner can edit either afterwards.
-- Safe to run multiple times.
ALTER TABLE hats ADD COLUMN IF NOT EXISTS seeking TEXT;
UPDATE hats SET seeking = hat_title WHERE seeking IS NULL;
