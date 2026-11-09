# Advertising Release C — Sponsor banner display foundation

**Status:** Code complete for controlled review; billing, allocation and live serving are disabled.
**Predecessors:** Release A (financial foundation) and Release B (advertiser/editorial review).
**Change type:** Schema, public read-only slot, Talent policy acceptance and per-placement detachment.

## Implemented

- `db/patch-ad-sponsored-slots-2026-11.sql` creates versioned Talent consent, 30-day sponsor placement inventory and one-per-placement detach audit. Campaign delivery flag defaults to `FALSE`.
- `GET /api/hats?ad_slots=<hat IDs>` is a public *read-only* batch endpoint. It returns empty results unless `CHOMBUTAR_AD_DELIVERY_ENABLED=true` is explicitly configured, and the migration and every required campaign gate is satisfied.
- Eligibility requires active Talent Hat, approved advertiser and image creative, active and date-bounded campaign and placement, approved + accepted pricing, recorded verified campaign funding, and the Talent's acceptance of the current advertising placement policy.
- `GET /api/escrows?ad_policy=1` shows a Talent's policy state and reserved/active placements; authenticated `ad_policy_accept` records policy acceptance; authenticated `ad_detach` permanently detaches a placement from the Talent-owned Hat with one audit record.
- `SponsoredHatSlot` renders a restrained, clearly marked **Sponsored** image banner **below** the Talent's original media. It is used by Bento cards, Hat details, signed-in Showroom posts and guest Showroom/Bento cards.
- Settings → Privacy provides explicit opt-in policy acknowledgement and placement detachment controls.
- Public slot reads are batched in the frontend and never trigger Discovery, Orbit, cash allocation or billable impressions.

## Safety: no live advertising by default

No API in this release can activate `ad_campaigns.delivery_enabled`, mark reserved placements active, or credit advertiser campaign funds.
No actual ads will display after code deployment alone.
No advertising income is recognized, no wallet funds move, and no payout worker is added.
Do not set `CHOMBUTAR_AD_DELIVERY_ENABLED=true` in production until the later commercialization gate approves verified funding integration, pricing, campaign activation, and audited delivery rules.

## Remaining requirements to call sponsored ads production-ready

1. Signed and validated sponsor creative uploads with rights verification.
2. Admin-controlled approved campaign activation and explicit inventory assignment.
3. Advertiser destination URL, moderation and safe outbound redirect policy.
4. Auditable even rotation/pacing and capped impression reporting. The current random candidate selector is an *unpaid prototype*, not evidence of equal delivered views.
5. Pricing, metering, refund and dispute/early-detach rules approved by owner.
6. End-to-end payment provider verification and budget reconciliation before enabling ad serving.
7. Full staging Postgres migration and browser walkthrough for owner/guest/admin.
8. Fraud/invalid delivery detection and appeals, including campaign accounting invariants.

## Order of operations

1. Merge Release B after all workflows pass.
2. Rebase/merge Release C on current main once all checks pass.
3. Apply migrations A, B, C **in that order** on a staging database.
4. Validate explicit ad-policy acceptance and detachment; no prior user should be auto-opted into paid advertising.
5. Leave the live delivery feature flag unset. No real-money campaign may start.
