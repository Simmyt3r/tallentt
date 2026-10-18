-- Increase community post attachments while preserving per-file and API quota protections.
BEGIN;
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT conname FROM pg_constraint WHERE conrelid='public.vibes_posts'::regclass
 AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%jsonb_array_length(media)%'
 LOOP EXECUTE format('ALTER TABLE vibes_posts DROP CONSTRAINT %I',r.conname); END LOOP;
END $$;
ALTER TABLE vibes_posts ADD CONSTRAINT vibes_posts_media_capacity
 CHECK(jsonb_typeof(media)='array' AND jsonb_array_length(media)<=10);
ALTER TABLE vibes_posts ADD CONSTRAINT vibes_posts_nonempty_content_check
 CHECK(char_length(btrim(body))>0 OR jsonb_array_length(media)>0);
COMMIT;