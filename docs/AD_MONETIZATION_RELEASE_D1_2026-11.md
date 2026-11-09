# ChombuTar Advertising — Release D1: verified reward preview

**Date:** 9 November 2026
**Status:** Admin-only read-only preflight. **No approved payouts, no financial posting, no revenue recognition.**
**Repository:** Simmyt3r/tallentt

## Features

- `shared/adRewardPreview.js`: deterministic whole-NGN allocation of the inherited 60/28/12 advertising split.
- Retains up to ten earliest first-pair, mutually verified Discover/Explorer sessions per selected Talent, using a **provisional** 30-day lookback before campaign commencement. Each Discovery qualifies as a **slot**, so an Explorer can earn from more than one Talent; pool splitting is over slots before totals are aggregated per recipient.
- Read-only `api/_lib/adSettlementPreview.js`: checks 30-day start/end, campaign lifecycle, exactly one approved/accepted pricing version, selected Talent consent and detachment, recorded funding evidence, verified billable-event counts, and evidence-backed early Discoveries. Ignores revoked events and held/rejected sessions.
- Admin-only GET endpoints `ad_settlement_overview` and `ad_settlement_preview`; existing `requireAdmin` controls access. The UI exposes separate candidate Talent, Explorer, platform, unallocated Explorer and funding-evidence amounts in Admin Advertising Review and Admin Finance. Every value is explicitly **provisional**.
- No new migration is required for this read path beyond existing Releases A→B→C and the existing verified Orbit and Explorer proof migrations.
- Tests: multiple reward slots for one recipient, duplicate and self-exclusion, ten-earliest selection, full allocation reconciliation, no Discoverers, and a PostgreSQL fixture with a subsequently revoked Explorer proof.

## This is NOT a payment implementation

The API returns `payouts_enabled:false`, `can_settle:false`, `can_post_wallet:false` unconditionally and exposes no POST operation.
No `ad_campaign_settlements`, `ad_reward_allocations`, `wallets`, `wallet_transactions`, or `ad_accounting_entries` rows are inserted or updated.
The resulting candidate earned amount is calculated from existing `ad_billable_events` records and accepted pricing, **not** actual independently reconciled sales or legally recognized revenue. It must never be added to Admin recognized-income totals.
A recorded `ad_funding_receipts.status='verified'` is not independent bank/provider verification until that integration exists.
All API results remain private to administrators.

## Unresolved owner policies / release blockers

1. Confirm the provisional 30-day pre-campaign first-Discoverer window and the maximum of ten per Talent.
2. Confirm whether payee allocation is by qualified slot (recommended and modeled) or once per distinct Explorer per campaign.
3. Establish treatment of detached/late-opt-in Talents; currently flagged as needing manual decision.
4. Approve handling of Explorer funds when zero eligible Discoverers exist; this preview keeps funds unallocated and does not transfer to platform revenue.
5. Define billing metrics, unit tariffs, invalid traffic and advertiser refund/make-good rights.
6. Define verifier roles, dispute/appeal time limits and Curator bonus budget.
7. Implement externally reconciled campaign funding and metric delivery plus a double-entry settlement transaction before live money.
8. Validate staging migrations and the true production database migration registry; merging never applies schema.

## Operational notes

A completed 30-day campaign is required before a readiness conclusion. An in-progress or incorrectly dated campaign can still be inspected for planning, but it always has settlement blockers.
The admin display shows a minimum-ten-Talent warning until an eligible inventory reaches the required threshold; a single Talent is included in tests to validate mathematical edge cases.
A missing schema produces a safe unavailable state; a zero-recipient pool remains unallocated rather than causing division by zero.
All existing service charges, salary tracking fees, subscriptions and business verification charges remain untouched.
Investor adverts and Talent Sponsor milestones are **separate**.
