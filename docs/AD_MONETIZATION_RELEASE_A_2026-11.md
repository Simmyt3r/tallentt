# Advertising monetization — Release A: inert financial foundation

Owner decisions (9 November 2026): retain existing marketplace fees, salary tracking, subscriptions and verification; introduce advertising separately; variable eligible Explorer payout; settle only after the completed 30-day campaign plus verification; keep advertiser payments distinct from Sponsor; performance pricing must be approved later; Talent ad attachment is automatic under an applicable agreement with detach rights.

## Implemented in this branch

- `db/patch-ad-finance-foundation-2026-11.sql` adds advertiser registration, campaign inventory, versioned commercial terms, funding evidence, billable-event evidence, settlements, reward allocations and accounting entries.
- All advertising states default to inactive / pending. No advertiser charging, wallet credit, payout, automatic placement, billing endpoint or settlement worker is implemented.
- Admin → Database Migrations lists **Advertising campaign financial foundation (inactive)**. Applying this migration is a separate authenticated administrator action, **not** a consequence of merging the PR.
- `shared/adAllocation.js` provides integer-only, deterministic simulation of the inherited 60/28/12 revenue split and variable per-eligible-recipient distribution. Missing recipients remain unallocated. Amounts are in whole NGN because the existing platform uses integer NGN units. Tests guard rounding, duplicate recipients and low inventory.
- Admin Finance exposes Investor advertising as *unavailable*, not as zero or earned, until source-linked settlement evidence is implemented.

## Explicit safety boundaries

Existing commission/escrow/wallet tables are neither altered nor backfilled.
No actual campaign can be funded, activated, paid out or recognized as revenue by these changes.
A stored funding receipt is not proof of cash settlement; future payment-provider verification and reconciliation are required.
The allocation module produces **illustrations**, not approved actual reward entitlement records.
Existing fees and the separate Sponsor verb remain unchanged.

## Before Release B

1. Agree billable outcome(s), rates and delivery guarantees for advertiser contracts.
2. Approve time-window treatment of the ten early Discoverers and missing recipients.
3. Determine early-detach payment and campaign credit/refund rules.
4. Approve Curator eligibility definition, bonus ceiling and oversubscription policy.
5. Review advertiser verification, forbidden categories, consent disclosures and data-protection obligations.
6. Implement immutable balance journal integration and balanced posting invariants before accepting money.
7. Provide integration tests using a real transactional PostgreSQL instance and a sandbox payment provider.

## Acceptance checks for this release

- `npm test` executes the deterministic allocation tests.
- `tests/admin-migration-bundle.test.mjs` confirms the allowlisted SQL file is bundled.
- Admin Finance shows advertising as unavailable (not earned and not a zero-income assertion).
- Inspect production migration status separately; do not run in production without an approved change window.
- Run schema migration against staging Postgres; confirm all constraints and rollback behavior.
