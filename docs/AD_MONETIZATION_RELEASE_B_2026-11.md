# ChombuTar Advertising — Release B progress and deployment gates

**Date:** 2026-11-09
**Parent branch:** `feature/ad-finance-foundation-2026-11` (PR #104)
**Feature branch:** `feature/ad-campaign-management-2026-11`

## Implemented

- Authenticated advertiser business registration. Registered companies start pending and require an Admin review.
- Advertiser-owned draft campaigns with idempotent creation keys, title, optional location and work category.
- Draft creative submissions restricted to HTTPS assets under the configured ChombuTar Cloudinary image/video upload path.
- Campaign owner can submit a draft for editorial review only after the business has been approved and at least one creative exists.
- Admin review queue for pending advertisers, pending creatives, and submitted campaigns. Review decisions are recorded in `ad_review_history`.
- Campaign content approval requires an approved advertiser AND at least one approved creative.
- Owner interface at `/advertise`, visible in signed-in secondary navigation.
- Admin review interface at `/admin?tab=advertising`.
- Migration `db/patch-ad-campaign-management-2026-11.sql`, independently applied after the Release A foundation.
- Unit coverage for input validation, Cloudinary domain isolation, review decisions and staging schema constraints.

## Deliberate safeguards

- No advertiser funding APIs; no Paystack charges; no wallet balance changes.
- No activation, paid placements, automated reward distributions, or financially recognized campaign performance.
- Editorial approval is **not** a commercial contract or a promise of delivery.
- Pricing fields and business model remain unconfigured until approved by the owner.
- Sponsor-to-Talent milestones remain separate from investor advertising.
- Existing monthly salary fees, service charges, subscriptions and verification fees remain unchanged.
- Server verifies campaign ownership, creative review prerequisites and account authorization; the frontend cannot bypass these.
- Database migrations are listed in Admin but are never run automatically as part of code deployment.

## Gates before testing against production

1. Merge PR #104 only after the failing Deal QR billing workflow is investigated and repaired.
2. Merge Release B only after the parent branch is current; run CI on the final merged main tree.
3. Explicitly apply Release A, then Release B SQL migrations to a disposable staging database and confirm rollback behavior.
4. Check `CLOUDINARY_CLOUD_NAME` on the target deployment and verify rights to submitted advertising assets.
5. Complete review of advertiser legal verification requirements and prohibited creative categories.
6. Add an integrated signed creative upload flow in Release C instead of pasting existing Cloudinary media URLs.
7. Approve performance metric, pricing schedule, verification method, refunds and settlement terms before accepting real advertising payments.

## Known limitations

- Advertiser requests are manual-editorial, not business registration document verification.
- A manual Cloudinary URL input is a staging tool, not a production-ready advertiser media uploader.
- There are no real sponsored placements in the guest/Showroom feeds.
- The optional Release B migration requires Release A; missing migration returns an explicit service-unavailable response rather than a blank page.
- Do not assume an approved content campaign has earned revenue.
