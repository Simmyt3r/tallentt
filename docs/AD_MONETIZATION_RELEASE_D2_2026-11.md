# ChombuTar Advertising Release D2 — Simulated Settlement Controls

**Status:** Test-only snapshot and review workflow; no money movement.
**Date:** 2026-11-10
**Repository:** `Simmyt3r/tallentt`

## Implemented

1. **Append-only simulation database.** The new optional Admin migration `ad-settlement-simulation-2026-11` adds `ad_settlement_simulations`, `ad_settlement_simulation_lines` and `ad_settlement_simulation_reviews`. Database triggers reject deletion or mutation of recorded snapshots and audit notes. It does not modify wallets, real advertising settlement tables or existing charges.
2. **Consistent reads.** Admin D1 preflight can now use a single database client. The D2 simulator locks the campaign and uses a repeatable-read transaction to snapshot funding records, milestone evidence, reward projections and blockers together.
3. **Exact reconciliation.** Every persisted test snapshot has deterministic, whole-NGN platform, Talent, Explorer and unallocated rows; totals must reconcile to the candidate earned amount before the insert occurs. SHA-256 fingerprint identifies a specific snapshot and prevents duplicate recording.
4. **Safe retries.** Recording the same campaign/evidence twice returns the existing snapshot. Changed source evidence creates a new revision, preserving history.
5. **Review and dispute records.** Admins can log simulated holds, disputes and `reviewed_for_testing` acknowledgements; the last requires an administrator other than the recorder. These are **not** authorization to pay.
6. **Admin UI and APIs.** The read-only D1 settlement preflight now has a section for test snapshots, revision history, blocker notes and review controls when the simulation is enabled. Every GET and POST is under existing `requireAdmin` access control.
7. **Regression tests.** Simulation arithmetic, distinct Explorer evidence, idempotency, immutable SQL triggers, second-admin review, version changes and untouched real wallet/accounting balances.

## Hard runtime block

**Simulation writes require both settings**:

- `CHOMBUTAR_AD_SIMULATION_ENABLED=true`
- `VERCEL_ENV=preview`

The service rejects the write outside an explicitly configured preview deployment. Do not set this flag in production. No customer operation, background job or untrusted request can switch this flag.

**Always disabled, including preview:** Wallet transfers, payouts, ledger posting, campaign activation, acknowledged earned revenue and any production advertiser funding.

## Migration order

On a **disposable staging database**, after inspecting the environment:

1. `ad-finance-foundation-2026-11`
2. `ad-campaign-management-2026-11`
3. `ad-sponsored-slots-2026-11`
4. `ad-settlement-simulation-2026-11`

The existing verified Orbit/Explorer migrations must also be installed for real Discovery eligibility previews. Merging source code does **not** apply any migration.

## Remaining blockers to live settlement

The product owner must approve pricing/measurement rules, the ten-Discoverer attribution window, single-versus-multiple Explorer reward slots, detached Talent treatment, unallocated balances, refund and dispute handling, Curator budget and maximum payout obligations.

Engineering must add: independent provider/bank funding reconciliation, campaign delivery and anti-fraud validation, legally approved contracts, atomic double-entry financial journal, payout authorization with comprehensive rollback/reversal tests, tax and customer-remedy handling. The D2 simulation records must **never** be imported as real settlement claims.

## Explicit limitations

- Admin review is not a substitute for economic or legal approval.
- Fingerprints detect exact recorded snapshot duplication; they are not an external digital signature or independent payment proof.
- Preview amounts depend on the recorded provider-funding and billable-event statuses; these are not independently verified gateway settlements.
- Snapshots may become stale after evidence is revoked. Always rerun preflight; do not treat an old simulation as payable.
- `VERCEL_ENV=preview` is required for the write feature, so local bare-node developers can read tests but cannot write a simulation without deliberately setting the preview flag.
