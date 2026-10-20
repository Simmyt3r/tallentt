-- Apply through Admin > Database Migrations.
-- Do not alter existing subscribers' explicit true/false preferences.
-- The API separately defaults an account with no saved preference row to all true.
BEGIN;
ALTER TABLE IF EXISTS notification_preferences
  ALTER COLUMN marketing SET DEFAULT true;
COMMIT;
