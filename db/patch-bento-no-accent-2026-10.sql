-- ChombuTar Bento accent palette: allow an explicit neutral/no-band option.
-- Apply after the Bento Inbox presentation patch.
BEGIN;
ALTER TABLE hat_presentation DROP CONSTRAINT IF EXISTS hat_presentation_accent_check;
ALTER TABLE hat_presentation ADD CONSTRAINT hat_presentation_accent_check
  CHECK (accent IN ('none','electric','coral','forest','violet','rose','slate','ocean','amber'));
COMMIT;
