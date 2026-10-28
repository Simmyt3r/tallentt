# In-app database migrations for chombuTar

**Admin → Database Migrations** enables authorized administrators to check and run approved, allowlisted, additive patches through the existing authenticated `/api/admin` endpoint. No user-editable SQL, uploaded patch, arbitrary path, code evaluation or unauthenticated bootstrap endpoint exists.

## Workflow
1. Log in as a user with `users.is_admin=true`.
2. Open `/admin?tab=migrations`. Check the **target database name** at the top and take a backup.
3. View **Not recorded**, **Applied** or **SQL changed: blocked** for each supported patch. Not recorded indicates no app-managed receipt, not necessarily missing tables; an administrator may already have run SQL manually.
4. Click **Review & apply**, type the exact displayed confirmation `APPLY <migration-id>`, and submit.
5. The server revalidates authorization against `users.is_admin`, recognizes only an allowlisted ID, checks the deployed SQL checksum, acquires an exclusive PostgreSQL advisory transaction lock, and executes inside a transaction. The patch, receipt and `admin_audit_logs` entry commit together. Failed SQL rolls back.
6. Refresh to view the applied timestamp and checksum. Repeated requests do not rerun an already recorded patch. Checksum drift blocks reapplication and requires a new reviewed migration.

## Selected supported scripts
- `bento-inbox-2026-10` → `db/patch-bento-inbox-2026-10.sql`
- `vibes-2026-10` → `db/patch-vibes-2026-10.sql`
- `work-pass-2026-10` → `db/patch-work-pass-2026-10.sql`

### Work Pass activation from Admin
1. Deploy the release that includes the new Work Pass migration catalog entry.
2. Open **Admin → Database Migrations** (`/admin?tab=migrations`) and confirm the target database name and a recent backup.
3. Find **Work Pass identity, proof & robot registry** and select **Review & apply**. The exact confirmation is `APPLY work-pass-2026-10`.
4. After the transaction completes, refresh and confirm the entry is marked **Applied** and records an admin/checksum receipt.
5. This migration creates tables for customer-approved completed-work evidence, robot registrations, issuer records and endorsements. It does **not** issue credentials or verify robots automatically.
6. Configure `WORK_PASS_SIGNING_PRIVATE_KEY` securely in the server environment (plus a stable `WORK_PASS_SIGNING_KEY_ID`) to activate signed QR credentials. Database migration success alone cannot enable digital signing.

If the Work Pass SQL was already applied by CLI, the migration's `CREATE TABLE IF NOT EXISTS` operations are designed to be repeatable; the Admin run records it as an audited migration. Verify existing schema and take a backup first.


These scripts are deliberately limited. The general `db/schema.sql`, large backfills, schema drops and dynamic raw SQL must **not** be exposed through this UI. Add later reviewed patches to the static catalog and deploy them as normal code changes. SQL files are bundled with the Vercel Admin function by `vercel.json functions.api/admin/index.js.includeFiles`.

The Admin function sets a 2.5-second lock timeout and a 25-second statement timeout within the transaction. A competing admin run returns **409**. Pre-existing successful manual migrations are repeatable but do not have a receipt until an admin presses Apply, so inspect the existing database and backup first.

## Database history and auditing
The first successful run creates `chombutar_schema_migrations` with `migration_id`, SHA-256 checksum, `applied_at`, and `applied_by`. A matching `admin_audit_logs` record is committed with each success. On a failed attempt the server rolls back and best-effort logs the failure to `admin_audit_logs`, without returning internal SQL details to the browser.

## Tests and deployment gates
`tests/admin-migrations.test.mjs` checks anonymous and ordinary account denials; unknown ID; invalid confirmation; stale checksum; application, replay, drift detection, history and audit; and simultaneous advisory lock conflict on real PostgreSQL CI. Existing booking, financial, mobile, and regression tests must continue passing.

The feature is not a backup system. Before a live migration, verify the correct production `DATABASE_URL`, backup and current database privileges. A running Vercel deployment is not proof that live migration execution works: run the first migration and refresh the page to verify the receipt. No new environment variable is required.

## Work Pass signing: one-click Admin activation
Open **Admin → Work Pass Security** (`/admin?tab=work-pass`) and click **Activate signing**. The server automatically applies its allowlisted signing-key storage migration if needed, generates an ECDSA P-256 key, encrypts it with HKDF + AES-256-GCM using the existing server `JWT_SECRET`, verifies that it can sign, and records the administrator and key ID in the audit log. No private key is exposed to the browser or recorded in application logs. The `WORK_PASS_SIGNING_PRIVATE_KEY` environment variable remains a backward-compatible fallback only.

Administrators can rotate keys from the same screen. Prior public verification keys remain available for eight days while existing signed QR passes expire after seven days. **Keep JWT_SECRET stable:** changing it without first re-encrypting the stored private keys makes the old keys unusable. Continue to back up the database.
