# Technical stabilization — Phase 1 of 5 (2026-11-07)

This phase repairs regressions and stabilizes the existing product. It **does not** implement the guest landing/showroom design (Phase 2), modify customer money, or perform live production database migrations.

## Changes

- Registration now honours the explicit Talent or Client selection. The old frontend always submitted `dual` and put the chosen Talent category into the geographic `users.lga` field. The new frontend no longer asks users to enter an industry as a city. API registration accepts an omitted LGA while still validating the role and an explicitly supplied real LGA.
- The security check that permits only new signed Cloudinary uploads or owner-approved archived media remains enforced; the unauthorised-media message now tells the user to use the secure uploader.
- PostgreSQL call/gallery test fixtures now provide required `hats.hat_name`, preserving database constraints rather than weakening them.
- Booking-proposal, Bento, pagination, Inbox and migration tests assert the **current** product behavior. The migration rollback tests compare against the base schema's initial state rather than assuming pre-existing `vibes_posts` does not exist.
- A dedicated registration regression checks role persistence, optional location, and rejection of unapproved roles.
- The Showroom Playwright gate now logs navigation status, module failures and console errors when the viewport fails to render.

## CI acceptance

Run all checks on the PR's final commit:
1. `CI`: PostgreSQL transactional tests and `npm run check:api`.
2. `ChombuTar Quality Gate`: the full DB/security regression suite, product-owner UX and production build.
3. `Showroom Full-Screen Experience`: multi-viewport Playwright feed, video and likes tests.
4. Other scoped workflows impacted by these files.

**Do not merge** unless the appropriate checks are green or a remaining failure is explicitly investigated and documented. Passing CI does not prove live Vercel configuration, providers or databases are healthy.

## Production database / migration verification — manual Admin sign-off required

These are read-only verification steps. Use the live Admin's Database Migrations page (not a local test DB); compare:
- Current database name and connection target; production database backup and recovery point.
- `associates-2026-10` before `orbit-milestones-2026-11`.
- `orbit-milestones-2026-11` before `orbit-verified-2026-11`.
- `employment-2026-10` before Hire confirmation and `wallet-peer-transfers-2026-11` before Sponsor confirmation.
- Base booking-completion, QR-settlement, dual-sided billing and monetization migrations before live commercial acceptance.
- Checksum mismatches must be investigated, **never** overridden or re-recorded merely to turn a status green.
- `test-completed-commissions-2026-11` is a specially scoped test deduction; **do not** apply it as a routine production migration.
- Compare previously recorded cash, escrow liabilities, fees, subscriptions and payouts before and after any permitted migration.

If an independent admin SQL reader is available, inspect (read-only):
```sql
SELECT current_database() AS database_name;
SELECT migration_id, checksum, applied_at
FROM chombutar_schema_migrations ORDER BY applied_at DESC;
SELECT to_regclass('orbit_milestone_events') AS keepup,
       to_regclass('orbit_verified_events') AS verified_orbit,
       to_regclass('orbit_hat_allowances') AS hat_allowances;
```
The migrations catalog does not prove a migration was applied; only the target production registry and matching schema do.

## Existing account data review (read-only, no mass rewrite)

Earlier registration versions stored the Talent category in the `lga` field. Possible affected rows can be reviewed, with names obfuscated outside privileged administration:
```sql
SELECT id, username, role, lga, created_at
FROM users
WHERE lga IN ('Music','Dance','Comedy','Fashion','Acting','Modeling','Art & Design',
              'Writing','Photography','Content Creation','Sports','Other')
ORDER BY created_at DESC;
```
Do **not** guess replacement locations, silently move values into another category column or overwrite user profiles. Offer affected account owners an explicit location correction flow and preserve change history.

## Exit criteria

- [ ] All dedicated CI and browser checks pass on the merge commit.
- [x] Registration no longer assigns all new users to `dual` and misstores categories as locations (code and DB regression).
- [ ] Live migration status and DB target independently verified by Admin.
- [ ] Live signup, login, Showroom and media upload verified on Android, desktop, with two non-admin accounts.
- [ ] No unintended wallet, escrow or salary-tracking mutations during deployment.
- [ ] Production monitoring and rollback/backup tested.

Incomplete exit criteria remain explicit launch risks, not automatically considered resolved by merging this PR.
