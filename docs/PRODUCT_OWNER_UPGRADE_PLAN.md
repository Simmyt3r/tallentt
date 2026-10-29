# Product owner upgrade: source audit and implementation plan

Reviewed 29 October 2026 against local branch `codex/unified-messaging`, commit `e9872eedb4291c4f64ff7736ce51b4eb1e17b887`, and the supplied “CHOMBOTAR — FINAL IDEA DOCUMENT”. This is a source-code assessment, not confirmation of deployed database state. No runtime behavior or pricing changed during this audit.

## What exists and what changes

| Area | Source evidence today | Required upgrade |
| --- | --- | --- |
| Talent Card | `api/users/[username].js`, `src/pages/PublicProfile.jsx`: username profile, skills, multiple active Talent Hats, aggregated portfolio, completed jobs. | Main talent selection, All/per-talent tabs, best-three portfolio selection, talent deep links, work preferences and employment status. Keep each Hat’s own pricing and booking identity. |
| Client Card | Same profile endpoint supports client/dual roles, company fields, successful hires and open dispute count. | Employer identity, posted-job counts, release-time metric, talent-to-client reviews, payment reliability and evidence-backed CAC verification. An open dispute must remain distinct from a loss. |
| Full-time | `api/_lib/hatFields.js`: Full-time, Part-time, hiring duration and delivery mode already supported as listing fields. | Dedicated employment agreement and monthly Notify + Confirm workflow. Listing type alone does not implement payroll. No salary notification/confirmation workflow was found in inspected APIs/schema. |
| Orbit | `api/_lib/accountOrbit.js`: account activity score capped at 100. `orbitScore.js`: another capped Hat confidence score. Schema also has Live score. | Versioned lifetime reputation events, account and talent totals, level calculation, employer trust and correction history. Do not silently reinterpret any existing score as lifetime points. |
| Reviews | Public profile code explicitly notes ratings are default values without a review pipeline. | Reviews tied to eligible completed work, one review per party, moderation and auditable corrections; then expose real aggregate stars. |
| Gig escrow | `bookingLifecycle.js`, `escrowPayments.js`, `bookingQr.js`: funded work, delivery, disputes and releases, including start releases. | Retain protections; implement the proposed 5% fee with stored fee terms and ledger entries, accounting for partial releases and refunds. Current terms in `AuthPage.jsx` promise no platform fee. |
| Privacy | Public profile uses an explicit public-field selection; existing Hat detail displays prices. | Separate salary expectation visibility from private agreed salary. Filter public API responses, not just screen text; cover search, cards, notifications and exported records. |
| Messaging | Unified Inbox, quoted replies and read receipts are published in draft PR #40. | Use the shared interface for employment discussions with participant permissions. Employment must not require funding a gig escrow merely to discuss or accept a job. |
| Paid plans | No paid subscription entitlement or payroll billing implementation found; push subscriptions are unrelated. | Talent/client plans, recurring billing status, server-enforced limits, upgrades/downgrades, grace periods and receipts. |
| Verification | Existing reviewed/verified Hats and identity-related fields are foundations. | Separate business verification evidence and review status from paid fees. Payment or notice deposit alone must not assert verified identity. |
| Revenue reporting | `financeReporting.js` records Live support fees and explicitly lacks a deal-fee accrual ledger. | Add reconciled fee records for gigs, payroll tracking, subscriptions and verification; distinguish revenue from held customer funds. |

## Implementation order and completion criteria

### 1. Talent and Client Card foundations

Extend the existing account/Hat model rather than creating duplicate identities. Add a stable talent grouping and main-talent choice; allow multiple Hats under the same talent. Add work-mode preferences and salary-expectation visibility (range, tier, private). Keep gig asking prices distinct from employment compensation.

Complete when one profile supports All and per-talent views, a share link opens the correct talent, existing Hat links/bookings still work, and public responses exclude private compensation. Preserve current users’ content when introducing limits later.

### 2. Employment agreements and Notify + Confirm

Introduce participant-scoped employment agreements with employer, talent, role, talent association, start date, notice terms, work mode and private compensation terms. Both parties accept a version of the terms. Model draft, pending acceptance, active and ended states independently from escrow.

Create one salary-period record per agreement/month with due date and payment method. Employer reports payment; talent confirms receipt or reports non-receipt. Preserve notification and correction history. Off-platform payments are participant-confirmed records, not bank-verified transfers. Use existing notification delivery and the shared inbox.

Complete when an employer can notify without funding escrow, only the named talent can confirm, duplicate/retried actions do not duplicate records or rewards, disputed periods do not display confirmed badges, and outsiders cannot access agreements or pay details. Test confirmation across month boundaries and after termination. Apply late penalties only under a defined due-date/dispute policy.

### 3. Reputation, reviews and employer reliability

Add an append-only reputation event ledger with unique source/event keys, rule version and reversing correction events. Derive overall and per-talent totals from eligible work; employer trust remains a distinct measure. Proposed level display is `floor(sqrt(max(points, 0) / 100))`, pending confirmation of rounding and negative balances.

Build verified-work review submission and payment reliability summaries. Reuse historical work only through a documented backfill rule; historical evidence may not support every proposed reward. Keep Live participation and completeness scores distinguishable from the new reputation.

Complete when duplicate callbacks cannot grant duplicate points, reversals are traceable, talent totals are attributable to the right talent, and payment ratios count eligible confirmed periods consistently. No stars or business credentials are fabricated from placeholder fields.

### 4. Launch monetization

Implement the owner’s proposed launch streams: 5% gig fee; 2% payroll escrow fee or NGN 1,000 bank-transfer / NGN 500 cash tracking; talent subscriptions; client subscriptions; NGN 3,000 business verification. Treat these as requested target values, with unresolved billing rules listed below.

Store fee policy on each new transaction; preserve existing agreements’ terms. Add immutable gross/fee/net entries, idempotent collection, refund handling and finance reporting. Update checkout disclosures and existing no-fee terms together. Enforce plan entitlements on the server, without deleting users’ existing works on downgrade.

Complete when partial and final releases charge the correct total exactly once, refunds reconcile, billing retries do not double-charge, plan limits survive direct API calls, and legacy deals retain their original terms.

### 5. Later expansion

Promoted cards, physical QR/NFC fulfillment, storage add-ons, mentorship commissions, partner referrals and white-label embeds follow the core launch. Existing QR/work-pass functionality is not a physical-card sales/fulfillment system. Partner names and revenue illustrations in the document do not demonstrate integrations or guaranteed outcomes.

## Product rules to settle before dependent implementation

These do not block card structure and privacy design, but affect billing, reputation and enforcement:

1. **Earned vs paid colors:** Green/Black/Gold describe both reputation levels and subscriptions. Show plan and earned level separately so buying a plan does not buy trust.
2. **Portfolio allowance:** Free subscription says three works; storage section says ten. Select one allowance. Define whether “one gig” is active concurrent work or a monthly quota.
3. **Salary disclosure:** The document both forbids public exact salary and allows an exact range. Proposed interpretation: consented expectation ranges may be public; agreed salary remains private.
4. **Reward overlap:** Does early delivery earn +50 instead of, or in addition to, +30 on-time? Define milestone eligibility, review edits, repeat media uploads and reversal rules.
5. **Late pay:** Define due date/time zone, grace period, holidays, non-response, contested payment, appeal and who can clear a restriction. Employer notification alone must not establish receipt or settle a dispute.
6. **Fee collection:** Confirm payer, billing trigger, failed-payment behavior, refund policy and whether payroll escrow’s 2% replaces the flat tracking fee. Specify handling of partial salary payments.
7. **Verification:** Separate employer identity verification, an optional secured notice deposit, and confirmed payment history into accurately named badges.
8. **Migration:** Decide whether lifetime Orbit starts at launch or backfills documented historical events; retain the previous score explanation during transition.

## Release approach

Deliver small migrations and feature-gated changes in the sequence above. Validate authorization/privacy, employment state transitions, reward idempotency and payment reconciliation with database-backed tests; verify cards and inbox on mobile and desktop. Publish reviewable GitHub changes before any production rollout. Current user instruction remains GitHub only; this audit neither deploys nor changes the live database.

Recommended first implementation slice: Talent/Client Card structure and compensation privacy, followed by the smallest end-to-end employment flow (accept agreement → notify salary paid → confirm receipt → show confirmed period).
