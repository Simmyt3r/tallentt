# In-app database migrations for chombuTar

**Admin → Database Migrations** enables authorized administrators to check and run two known, additive patches through the existing authenticated `/api/admin` endpoint. No user-editable SQL, uploaded patch, arbitrary path, code evaluation or unauthenticated bootstrap endpoint exists.

## Workflow
1. Log in as a user with `users.is_admin=true`.
2. Open `/admin?tab=migrations`. Check the **target database name** at the top and take a backup.
3. View **Not recorded**, **Applied** or **SQL changed: blocked** for each supported patch. Not recorded indicates no app-managed receipt, not necessarily missing tables; an administrator may already have run SQL manually.
4. Click **Review & apply**, type the exact displayed confirmation `APPLY <migration-id>`, and submit.
5. The server revalidates authorization against `users.is_admin`, recognizes only an allowlisted ID, checks the deployed SQL checksum, acquires an exclusive PostgreSQL advisory transaction lock, and executes inside a transaction. The patch, receipt and `admin_audit_logs` entry commit together. Failed SQL rolls back.
6. Refresh to view the applied timestamp and checksum. Repeated requests do not rerun an already recorded patch. Checksum drift blocks reapplication and requires a new reviewed migration.

## Supported scripts
- `bento-inbox-2026-10` → `db/patch-bento-inbox-2026-10.sql`
- `vibes-2026-10` → `db/patch-vibes-2026-10.sql`

These scripts are deliberately limited. The general `db/schema.sql`, large backfills, schema drops and dynamic raw SQL must **not** be exposed through this UI. Add later reviewed patches to the static catalog and deploy them as normal code changes. SQL files are bundled with the Vercel Admin function by `vercel.json functions.api/admin/index.js.includeFiles`.

The Admin function sets a 2.5-second lock timeout and a 25-second statement timeout within the transaction. A competing admin run returns **409**. Pre-existing successful manual migrations are repeatable but do not have a receipt until an admin presses Apply, so inspect the existing database and backup first.

## Database history and auditing
The first successful run creates `chombutar_schema_migrations` with `migration_id`, SHA-256 checksum, `applied_at`, and `applied_by`. A matching `admin_audit_logs` record is committed with each success. On a failed attempt the server rolls back and best-effort logs the failure to `admin_audit_logs`, without returning internal SQL details to the browser.

## Tests and deployment gates
`tests/admin-migrations.test.mjs` checks anonymous and ordinary account denials; unknown ID; invalid confirmation; stale checksum; application, replay, drift detection, history and audit; and simultaneous advisory lock conflict on real PostgreSQL CI. Existing booking, financial, mobile, and regression tests must continue passing.

The feature is not a backup system. Before a live migration, verify the correct production `DATABASE_URL`, backup and current database privileges. A running Vercel deployment is not proof that live migration execution works: run the first migration and refresh the page to verify the receipt. No new environment variable is required.
