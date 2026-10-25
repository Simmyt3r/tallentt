# ChombuTar Notification Priority System
Based on the uploaded two-page **Chombotar - Notifications System**.

## Delivery rules

The subscriber-facing inbox has an **All** filter (the default) plus four server-filtered lanes: **Bento**, **Wallet**, **Associates**, and **Hits & Vibes**. The same lanes power unread count/dot priority. Searches and older-page pagination are scoped on the server to the chosen lane, never just filtered after a page is downloaded.

| Lane | Examples | Priority | Can mute |
|---|---|---|---|
| Bento | Booking/request, proposal, job accepted/rejected, checkpoint, dispute | High | No, for essential work alerts |
| Wallet / Audio Money | Escrow, wallet top-up, release, withdrawal | High | No, for essential money alerts |
| Associates | Associate request and response, community networking chat | Normal | Yes |
| Hits & Vibes | Showroom/Orbit/verification and eligible Hits & Vibes | Daily digest | Vibes digest or Off |

The backend categorizes from existing trusted `notifications.type` values. This does not add money to a wallet, approve escrow payments, or create fictitious work. A repeated like/view or generic comeback prompt is not dispatched as a notification.

Browser permissions are ALWAYS device-controlled: mandatory **in-app** categories do not imply permission to send OS notifications or override a subscriber's browser/site block. Vercel Web Push can request high urgency; the device/browser ultimately controls sound. Associates and Fame pushes are sent quietly.

## Daily digest

A Vercel production-only daily cron calls:
`GET /api/auth?action=daily-notification-digest` at 06:00 UTC (07:00 in Nigeria).

**Required:** configure a long random `CRON_SECRET` in the Vercel Production Environment Variables. Cron requests must supply `Authorization: Bearer <CRON_SECRET>`; no valid key, no dispatch. Configure VAPID Push Setup too. Do NOT store credentials in Git.

Only unread, genuinely recorded Fame events from the preceding 24 hours count. Vibes are included only with the subscriber's `vibes_mode='digest'`; Off suppresses the Vibes portion, not the financial or job alerts. A unique database claim makes each person's digest at most once per UTC day. Processing is bounded to 100 users per invocation: add cursor/resume processing before scaling past this audience. Partial external delivery does not guarantee all subscribed devices displayed a notification.

The `notification-priorities-2026-10` patch is allowlisted under Admin → Database Migrations. It adds optional `associates`, `vibes_mode`, a digest idempotency receipt, and first-ten-like uniqueness without erasing previous rows. Runtime push setup also supports additive column creation for legacy databases.

## Vibes & Hits

- Every like, view and profile visit produces no direct alert.
- On a new Hit that actually reaches ten likes, one durable milestone is recorded, with a uniqueness constraint for concurrency.
- A reply generates a digest-eligible notification only when the commenter is a verified talent or an accepted mutual Associate. Ordinary replies remain visible in comments.

## Still to be built and verified

The PDF describes future events that the current underlying systems do not yet authoritatively emit. Do **not** fabricate these notifications:

- Job deadline in three hours needs a stored deadline, scheduler and per-deal idempotency.
- Tip/Gift received, job split and low balance need confirmed financial/ledger events, not anticipated amounts.
- New Common Associates and introduction requests depend on the Associates feature branch and authenticated introduction workflow.
- Showroom Top 12, about-to-exit and Orbit Legend level-up require verified, audited ranking and level thresholds.
- New Hit by Associate needs an actual subscription/Associate fanout rule with anti-spam batching.

## Release procedure

1. Run new feature tests, security checks, full CI, PWA build and responsive UI checks.
2. Back up PostgreSQL and apply `notification-priorities-2026-10` in Admin.
3. Configure `CRON_SECRET` and ensure VAPID settings and real browser push subscriptions exist.
4. With two accounts, test a real booking, Paystack-confirmed escrow, Associate message, 10 likes, a qualified reply, opt-outs, denied browser permission and the four tabs.
5. Trigger a signed digest in staging and prove that duplicate requests cannot send a second digest. Do not send test pushes to unrelated live subscribers.
6. Verify deadline and low-balance alerts are **not** advertised until independently implemented.

This change is a limited first release of the PDF rules, not evidence that every proposed event source already exists.
