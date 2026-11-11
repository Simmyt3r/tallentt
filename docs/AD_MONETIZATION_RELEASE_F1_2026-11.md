# ChombuTar Advertising — Release F1: Controlled Pilot Readiness

**Date:** 2026-11-11
**Status:** Read-only Admin readiness audit + production banner hard stop. No pilot funds collected.
**Predecessors:** Releases A, B, C, D1, D2, E.

## Delivered

- Admin → Advertising Review includes **Pilot readiness** with migration coverage, internal advertiser/campaign/creative counts, opt-in/placement state, simulation count and a commercial/engineering blocker checklist.
- Read-only `GET /api/admin?action=ad_pilot_readiness` is protected by the existing admin role check.
- Counts of receipts marked `verified`, billable records and accepted price terms are explicitly labelled *internal database assertions*, **not** independently reconciled provider or bank settlements.
- The readiness result ALWAYS responds with `pilot_ready:false`, `paid_delivery_allowed:false`, `paid_campaign_activation_allowed:false`, `external_payment_verified:false`, `payouts_enabled:false` because no trusted payment/delivery integration or formal commercial approval currently exists.
- Historic banner delivery now requires `VERCEL_ENV=preview` **as well as** `CHOMBUTAR_AD_DELIVERY_ENABLED=true`. Video previews already require both plus their separate video flag. Production cannot display ads merely because the legacy banner flag is accidentally set.
- No new SQL migration, payment route, wallet write, campaign state transition or finance reporting claim is introduced.

## Pilot runbook (safe sequence)

1. **Audit deployment**: verify branch, Vercel preview environment, database target and secret presence. Do not enable flags on production.
2. **Staging migration check**: inspect Admin Database Migrations for advertising A→B→C→D2 and verified Orbit/Explorer dependencies, without touching production data. Apply only to a disposable staging DB after approval.
3. **Editorial exercise**: use test advertiser identity, test creatives, manual Admin approval and Talent placement-policy acceptance on staging. All participants informed that the pilot is a simulation.
4. **Simulation**: use D1 candidate reward preview and, when separately enabled, D2 immutable test snapshots. Never convert simulated allocations to real wallets.
5. **UI verification**: confirm sponsored banner and video previews work with correct feature flags, and vanish if permissions expire, creatives are rejected, placements detach or campaign dates lapse.
6. **Safety verification**: verify production stays free of sponsor content regardless of the legacy banner flag, and no platform earnings are recognized from simulated receipts or delivery records.
7. **Pilot outcome report**: collect only qualitative UX observations and staging errors; do not report these as verified ad reach, conversion or billable commercial results.

## Blocking product-owner decisions

- Approved payable event metrics, pricing rates and delivery promises.
- Early Discoverer 30-day window, multiple rewards per Explorer, and zero-recipient pool disposition.
- Talent detachment, replacement and refund rules.
- Curator eligibility, monthly bonus ceiling and oversubscription.
- Commercial advertiser policies and media rights/endorsement consent.
- Cancellation, dispute, refund and payout appeals windows.

## Engineering required for live advertising

- Provider-signed payment webhooks, independent verification and reconciliation against bank/gateway amounts.
- Server-authoritative event ingestion, invalid-traffic rejection, fair rotation, frequency caps and campaign delivery reports.
- Signed verified creative uploads, advertiser destination link moderation and campaign assignment/scheduling.
- Double-entry balanced financial ledger, audited refund logic, idempotent settlement and two-person payout approvals.
- Automated staging-to-production controls, operational playbooks, incident response, and tax/privacy compliance checks.

## Acceptance

- Tests must prove `pilot_ready` and all payout/payment status flags remain false even if every preview flag is on.
- Missing tables produce an explicit checklist without errors or bogus zero earnings.
- Read-only report preserves wallets and financial ledgers.
- Production banner endpoint produces an empty payload when delivery flag is set accidentally.
- Main CI, unit/PGlite tests, build, browser workflows and Vercel preview must all pass before merging.
- **No production migration, live ad serving, real money, or user payout is authorized by this release.**
