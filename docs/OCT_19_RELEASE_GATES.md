# ChombuTar release gate: 19 October 2026

## UI and accounts

- Hits & Vibes usernames are displayed as `^username`. Its composer uses two compact rows.
- The unwanted header X and Back controls beside the ChombuTar logo were removed.
  Device Back remains available. Notifications now includes the same
  pill-style search input as Showroom, searching all inbox history on the server.
- The shared `DiscoverySearch` component remains the same across Showroom,
  Vibes, BentoField, My Hats, and Deals.
- Showroom media captions: **Showroom → + → choose posting route → select
  photo/video → Add a caption → Publish**. A contextual hint now appears during media selection.
- BentoField uses the *subscriber-level* Orbit score from the public profile
  rather than the old Hat-level completeness/likes score. It is fetched
  lazily once per visible subscriber within a short shared client cache.
  Orbit remains activity-based (0–100) and is not government verification.

## General chat

The global header chat control opens **/chats** (Community Chat).
Existing **/messages** is still the separate, payment/escrow-aware
Deals Chat.

Apply `db/patch-community-chats-2026-10.sql` via
**Admin → Database Migrations** before using community messaging.

- Start by searching an existing public username.
- A new subscriber can send one introductory chat request.
- The recipient may accept, decline, or block. Normal replies are possible
  only after acceptance. Either participant may block an existing chat.
- Membership checks protect every thread read/write.
- Rate limits: max 8 new contact requests/day and 60 messages/hour;
  each message at most 2,000 characters.
- No payment authority, escrow eligibility, or contact unlock is inferred
  from a community conversation.
- This initial release has no group messaging, attachments or encryption
  claims. Apply abuse testing and moderation operations before mass rollout.

## Finances

**Admin → Overview** displays a distinct **Escrow Liability** metric.
**Admin → Finance** contains separate sections for outstanding customer
money and traceable platform income.

- Secured escrow liability = sum of the *unreleased remainder* of each
  currently secured escrow.
- Subscriber wallet balances and pending withdrawal obligations appear as
  separate claims and are **never** treated as platform income.
- The only currently recognized fee income in this report is the
  `platform_fee` stored on **successful Live support transactions**.
  A source link opens a searchable-by-reference transaction audit at
  `/admin?tab=finance&stream=live_support`.
- Deal commissions, advertising and sponsorship revenue **must not be
  invented**. They remain marked "not recorded" until real authoritative
  source records and settlement reconciliation are available.
- **Gross platform accrual is not net profit or cash in bank**: costs, taxes,
  payment fees, reversals and transfers must be reconciled before reporting
  owners' distributable profit.
- The report performs **read-only SQL queries** and cannot move money.
  Production finance figures require payment-processor and bank reconciliation.

## Live Broadcast

The Live UI rechecks MediaMTX readiness when someone starts broadcasting
and provides a retry action explaining failure status. The Admin dashboard
also distinguishes actual server reachability from merely present variables.

The application cannot relay public video without a persistent, reachable,
HTTPS WHIP/WebRTC ingest plus HLS media server, ICE/TURN, and a working
MediaMTX external HTTP authorization configuration. See
[Live setup guide](LIVE_DEPLOYMENT.md).

The official MediaMTX documentation specifies that external auth POSTs
include `action`, `protocol`, `path` and `token`; Live must allow
authenticated token-bearing `publish` while permitting stream reads only
for actively broadcasting rooms. Before approval, verify a Talent publisher
and an unrelated viewer simultaneously over different networks.

## Release checklist

1. Back up production PostgreSQL and inspect all pending migrations.
2. Deploy and run `npm run check:api`, `npm test`, `npm run build`,
   and `npm run test:ui`.
3. Apply the allowlisted **General subscriber chats** migration and test
   Alice/Bob invite/accept, block, rate-limit and unauthorized reads.
4. Inspect Admin Finance numbers against live escrow and Paystack settlement
   ledgers; do not transfer owners' funds based only on the partial summary.
5. Confirm Vibes automated media decisions and administrator report queue,
   Showroom caption rendering, card Orbit score and compact headers.
6. Validate actual MediaMTX publishing and playback from separate devices.
7. Release only after Vercel build checks, database migration logs, and
   end-to-end functional tests pass.

**As of the commit preparing this document**, Vercel status checks were
failing, and the connected Vercel account did not have permission to inspect
the `talent-world` deployment logs. Repository changes are **not**
evidence of a successful production rollout.
