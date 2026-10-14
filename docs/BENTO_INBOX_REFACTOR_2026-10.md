# chombuTar Showroom, Bento Flier & Inbox Release (October 2026)

## Database gate (required)
Back up the production PostgreSQL database. Run `npm run db:migrate:bento-inbox` with the correct `DATABASE_URL` **before merging or deploying PR #26**. The migration is `db/patch-bento-inbox-2026-10.sql`, transactional and idempotent. It adds:
- `hat_presentation.bento_mode` (`standard` / `flyer`) and `flyer_public_id`;
- `notifications.deleted_at` with an index for visible notices;
- `conversation_visibility(user_id, escrow_id, hidden_at)` to hide deals chat for the current user without deleting transaction evidence.

Check with read-only SQL:
```sql
SELECT to_regclass('conversation_visibility') IS NOT NULL AS chat_hide_ready,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='deleted_at') AS notification_delete_ready,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hat_presentation' AND column_name='bento_mode') AS bento_flyer_ready;
```
All three should return `true`. No data is deleted during migration.

## Behavior
- **Showroom** remains the authenticated home and now shows its name beside a single expanding search icon. Other pages retain the header search shortcut, which navigates to and focuses Showroom search.
- Both desktop and mobile primary navigation say **Showroom**; **My Hats** is in the mobile bottom row.
- **Bento → standard or flier:** Edit a Hat and upload an image (such as a flier) into its existing media, then **My Hats → Customize → Bento card design → Flier design** and select the approved image. Moderation-pending/held images are not eligible. This avoids arbitrary outside URLs and preserves the creator's identity, T/C badge, CTA and price.
- **Notifications:** delete individually or Clear all. Only the recipient's own inbox is affected, and the audit record is retained.
- **Deals Chat:** delete hides the conversation from the current user's inbox only. Its contents remain accessible through the underlying deal/dispute records, and a new message will make the conversation reappear. This is intentionally not hard deletion of financial records.

## Acceptance / QA
CI must pass `npm test`, `check:api`, `build`, `test:ui` and specifically `tests/bento-inbox.test.mjs`. Run mobile navigation/search at 320/390 pixels; test flier with normal, pending and held assets; test chat deletion independently from both counterparties. Confirm a new message reopens the recipient's hidden chat. Test notification deletion and Clear all for account isolation. Final deploy validation on Vercel is separate from GitHub CI.
