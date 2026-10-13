# chombuTar Production Loose-Ends Audit
Date: 13 October 2026
Repository: Simmyt3r/tallentt
Baseline: main at 55b5e46c (PR #24 merged)

## What this audit covers
This is a code-and-CI assessment of the marketplace workflows. It is **not** a declaration that production payments, mobile camera access, Cloudinary moderation, or Vercel deployment have passed a live test. The latest baseline CI passed but uses mocked Paystack/Cloudinary and simulated browsers. Confirm environment-dependent behavior with real staging and test accounts before accepting deposits.

## Confirmed defects fixed in this patch

| Priority | Area | Finding | Resolution |
| --- | --- | --- | --- |
| P1 | My Deals | In-flight response from Talent Mode can overwrite Client Mode (or another tab) after navigation, showing the wrong set of cards/counts. | Ignore responses and pagination requests that no longer belong to the current user/role/tab; guard overlapping refreshes. |
| P1 | My Deals | Corrupted/stale `_role` value can result in an invalid My Deals API request and a broken default view. | Validate saved role against `talent`/`client`, fall back to `talent`. |
| P2 | My Deals | Older pages appended without checking IDs can duplicate cards after retries/overlapping updates. | Deduplicate based on escrow/application ID. |
| P1 | Notifications | Push/realtime/poll refresh replaces the entire notification list, erasing any older pages already loaded, and resets the paging cursor. | Merge newly fetched items into existing history, update matching IDs from the server and preserve the older cursor after paging. Ignore outdated refresh responses. |
| P2 | Live discovery | Live room list failure is silently swallowed and rendered as “No Talent is live right now.” This disguises outages as zero activity. | Show a loading state, visible API error and Retry button; keep the empty state only for successful responses. |

Browser regression suite `tests/loose-ends-ui.mjs` exercises late API responses, dual-role view switch, older notification retention after push, Live failure/retry, and responsive overflow (390px and 1280px). The CI `test:ui` command includes these checks.

## Reviewed areas and remaining validation

| Priority | Flow | Evidence / status | Next gate |
| --- | --- | --- | --- |
| P0 release gate | Wallet funding, Paystack webhooks, escrow debit and 30/70 QR settlement | Transactional code and synthetic PostgreSQL tests exist; *real money/provider sandbox end-to-end not verified in this audit*. | Run test-mode top-up, two-party acceptance, wallet funding, start scan, work delivery, approval, completion scan and idempotent rescan; reconcile ledger and provider references. |
| P0 release gate | Payment disputes, refunds, withdrawal failure | Lifecycle state machine, admin authorization and integration tests exist; *live payout/webhook failure handling not verified*. | Simulate client dispute, approved refund, transfer failure, retries and race conditions with Paystack test transactions. |
| P1 configuration | Signed Cloudinary uploads | Owner-bound permit validation and tests present; legacy unsigned preset remains when rollout flag is off. | Run Admin preflight, check origin/cloud configuration, then activate enforcement only after successful upload/claim on staging. |
| P1 configuration | Showroom moderation | Database queue and moderation Admin UI present; moderation may be disabled until Vision API and worker credentials/config are set. | Verify Google Vision test, worker schedule, safe/held content, audio manual review and appeals on staging. |
| P1 configuration | Push notifications | VAPID and subscription machinery plus tests exist; device delivery is outside CI. | Test granted/denied permissions and delivery/read state on Android Chrome and desktop. |
| P1 quality | Live Stage | VP9/WHIP/MediaMTX pipeline and preview fallback code exist; real browser-to-edge viewer playback not proven. | Device-to-device stream, disconnect/reconnect, data-saver and low-bandwidth acceptance tests. |
| P2 UX | Bento/Home | Mixed Talent+Client feed, Showroom Home and header quick actions passed branch CI. | Device test at 320, 390 and 768px including PWA installed mode. |
| P2 UX | Negotiation Center | Action needed/Ongoing/Completed, separate negotiation threads and API unit tests exist. | Multi-user simultaneous offers, withdraw, accept, lost network, expired session and pagination behavior in staging. |
| P2 UX | My Deals history refresh | Refresh intentionally reloads the first page, dropping previously fetched older pages. Retaining stale cards would also misrepresent moved deals. | Decide on server-provided version/cursor and reconnect-aware pagination before changing behavior. |

## Orbit Score, after readiness

There is already a small `api/_lib/orbitScore.js` heuristic (0–100, using media, likes, bookings, verification and profile fields), and Hat endpoints persist its result. **Do not treat this as a completed or fraud-resistant ranking system.** It is not yet a dependable measure of completed delivery, verified reputation or recent activity. The current inputs can favor superficial profile completeness and repeated likes; no new Orbit algorithm is activated by this patch.

Before Orbit Score v2:
1. Finalize the verified event sources (completed, refunded, disputed, verified reviews, account trust), keeping payout values distinct from engagement counts.
2. Define published, explainable scoring rules and exclusions (self-interactions, duplicate interactions, disputed/refunded work, unverified claims), plus decay and a new-user baseline.
3. Backfill scores from committed records with an idempotent migration/job; keep a previous-score ledger or derivation version for auditability.
4. Add integration tests for manipulation, replay, simultaneous events and score stability and release behind a flag.
5. Show transparent reasons and an appeals route; never imply Orbit Score is an external background check or verified identity.

## Operational release rule
No new database migration is required for the loose-end fixes. Changes are on a separate PR until full CI passes. Do not advertise production as payment-ready based solely on CI or enable screening/signed upload flags without the above gates.
