# ChombuTar v4.0

Production-ready PWA talent marketplace: dual Creator/Employer roles, Hats, Showroom, Cloudinary portfolio uploads, Neon Postgres, escrow (no platform fees), anti-leak masking, installable offline-capable app.

## Stack

- **Frontend:** Vite + React 18 + Tailwind 3.4 + React Router + lucide-react  
- **PWA:** vite-plugin-pwa (manifest, service worker, CacheFirst for Cloudinary)  
- **Backend:** Vercel Serverless Functions `/api/*` + Neon Postgres (`pg`)  
- **Media:** Cloudinary (unsigned client preset + server `CLOUDINARY_URL`)

## 1. Cloudinary setup

1. Cloud name: `j1nochxj` (already set in env example).  
2. Dashboard → Settings → Upload → **Add upload preset**  
   - Name: `chombutar_unsigned_preset`  
   - Signing mode: **Unsigned**  
   - Folder: `chombutar_hats`  
   - Allowed formats: image, video, audio  
   - Max file size: 20MB  
   - Transformations: enable `f_auto,q_auto` if desired  
3. Keep **API secret** server-only. Client uses the unsigned preset only.

## 2. Neon Postgres

1. Use the **pooled** connection string (host contains `-pooler`).  
2. Append `?sslmode=require&channel_binding=require` if not already present.  
3. Run migrations:

```bash
export DATABASE_URL="postgresql://..."
npm run db:migrate
```

This creates `users`, `categories`, `hats`, `hat_media`, `applications`, `escrows`, `booking_messages`, `wallets`, `wallet_transactions`, `notifications`, `admin_audit_logs`, `leak_attempts`, and seeds default categories.

## 3. Environment variables

Copy `.env.example` → `.env` (never commit `.env`):

```
VITE_CLOUDINARY_CLOUD_NAME=j1nochxj
VITE_CLOUDINARY_UPLOAD_PRESET=chombutar_unsigned_preset
VITE_CLOUDINARY_FOLDER=chombutar_hats
VITE_APP_NAME=ChombuTar
VITE_APP_URL=https://your-app.vercel.app

DATABASE_URL=postgresql://...pooler.../neondb?sslmode=require&channel_binding=require
CLOUDINARY_URL=cloudinary://KEY:SECRET@j1nochxj
CLOUDINARY_CLOUD_NAME=j1nochxj
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
JWT_SECRET=<long random string>
NIN_HASH_SECRET=<a different long random string>
```

Generate JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add the **same keys** in **Vercel → Project → Settings → Environment Variables** (Production + Preview).

## 4. Admin access

Run the migration first, then promote the first operator directly in Neon:

```sql
UPDATE users SET is_admin = true WHERE email = 'you@example.com';
```

Admin users see `/admin` in the app header. The panel covers user review, hat moderation, applications, escrows, wallet transactions, withdrawal status reconciliation, and audit logs.


## October 17 UI / Orbit Score release candidate

- **Live:** A single active Live Broadcast tab is displayed beside Stage Competitions.
  Talent accounts use that tab to set up broadcasting; other subscribers use it
  to reach the list of live streams.
- **Header:** ChombuTar wordmark is visible on each route; discovery search is
  shown inside Showroom rather than duplicated globally. Page headings and their
  descriptions stay sticky under the shared application header.
- **Notifications:** Plain inbox display. Long-press on mobile or right-click a
  notification to open the delete confirmation; no row-level trash icons.
  Web Push setup lives under Settings → Notifications.
- **My Hats:** Edit and Delete controls are separated in both grid and list.
  Owner-visible data review notes link to the Hat editor.
- **Showroom:** New composer offers *Create Hat*, *Choose existing Hat*, or
  *Upload gallery media for entertainment*. Opening a photo or video provides
  the detail view; only owners see the remove/delete action. Viewers see the
  appropriate listing details and Book controls when the post is a commercial Hat.
- **Bento design:** Minimal, Bold, Media First, Editorial and Dark presets now
  render distinct actual Bento card styles, with flier support and neutral accent.
- **Settings:** Account, Push notifications and Security/Password recovery live
  on /settings. No artificial controls that pretend a backend preference exists.
- **Admin:** The *Orbit & Hat Review* tab lets Admins review newly submitted Hat
  data and request owner corrections. This review is informational: it does not
  silently cancel contracts or interfere with escrow. Adjust the six approved
  Orbit weights there, always totaling 100 points. Changes are audited.
- **Profiles:** The subscriber's Orbit Score is visible with a breakdown.
  The score excludes likes/views, uses capped participation on distinct days
  and completed funded jobs/hires, and **does not certify identity or guarantee
  trustworthiness**.

Before activating Orbit governance, apply **Orbit Score and Hat data review**
in Admin → Database Migrations. Validate with
`npm test && npm run check:api && npm run build`, then run mobile and
desktop regression tests. Review pending deployments and provider configuration
before production approval. A commit is not proof of a passed deployment.

## October 2026 Showroom, Stage and Deals Calling rollout

**Before enabling the new workflows:**

1. Open **Admin → Database Migrations** and apply the Independent Showroom Gallery,
   Live Stage Competitions and Deals Chat Calls patches (plus earlier pending dependencies).
   These are additive and retain existing Hats, negotiations and escrow records.
2. Set `HAT_MEDIA_SIGNED_UPLOADS=enforce` and configure the existing server-side
   `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`.
   For automated photo approval, configure `GOOGLE_CLOUD_VISION_API_KEY`.
   Videos wait for full human review in Admin → Showcase Moderation.
3. Configure the external **MediaMTX** publishing and HLS playback endpoints for
   public Live streaming. Private fallback camera previews cannot join Stage
   competitions. Contestants need an active public Live broadcast.
4. WebRTC calling works with STUN on permissive networks, but NATs and mobile
   carriers often need a TURN relay. The backend supports short-lived Coturn
   REST credentials with the **server-side** environment variables:

   ```env
   TURN_URLS=turn:your-turn.example:3478,turns:your-turn.example:5349
   TURN_SHARED_SECRET=<coturn-auth-secret>
   ```

   Configure Coturn with `use-auth-secret` and the same private static
   authentication secret. Never put `TURN_SHARED_SECRET` in a `VITE_`
   variable; the backend derives temporary subscriber-bound credentials.
   Calls are limited to secured, unlocked and non-disputed deals; they
   expire after two hours. Signaling is purged when calls end, and call
   metadata is removed after 30 days.

**Product boundaries:** Independent Showroom posts are entertainment-only;
they cannot receive applications, bids or bookings until promoted through an
actual Talent Hat. The gallery holds new video posts for review. Live Stage
Competitions currently use a no-stake, one-vote leaderboard; no wager, prize
distribution or wallet settlement is performed. Call audio/video is
peer-to-peer DTLS-SRTP, not platform-recorded.

**Release gate:** Run `npm run verify`, then test the relevant desktop and
mobile workflows with two separate accounts, and verify Paystack top-up
methods in the merchant account. A successful Vercel build alone is **not**
proof that real streaming, TURN traversal, email or bank payments work.

## Admin migration and recovery rollout (October 2026)

The Admin Command Center now provides an allowlisted **Database Migrations** panel at
`/admin?tab=migrations`. Back up production first and apply pending patches
in the order shown by that panel:

1. Bento fliers and inbox management (only if not previously installed)
2. No-accent Bento option (depends on `hat_presentation`)
3. Hits & Vibes (only if not previously installed)
4. Showroom owner removal
5. Password recovery

Applying a patch records its checksum and Admin identity. A changed checksum
requires a reviewed follow-up migration, not an unsafe forced replay.
Showroom removal only hides an owner's listing from the discovery feed.
It does **not** delete the underlying Hat, files, financial records or deals.

Password recovery is delivered by Resend. Before enabling it on a deployment,
configure the following **server-side** environment variables in Vercel:

```env
APP_PUBLIC_URL=https://your-chombutar-domain.example
RESEND_API_KEY=<resend-api-key>
PASSWORD_RESET_FROM=ChombuTar <security@your-verified-domain.example>
```

The sender domain must be verified with your email provider, and the app's
HTTPS public URL must point to the same deployed environment. Never put the
Resend secret in a `VITE_` variable. Password recovery returns a generic
response for existing and non-existing addresses. Reset links expire in
30 minutes, are one-use, and their raw tokens are never stored in PostgreSQL.

**Vibes media:** Text posts work through `/api/vibes`. Photo posts require
`VIBES_MEDIA_UPLOADS=enabled`, valid signed Cloudinary server credentials
and `GOOGLE_CLOUD_VISION_API_KEY` for fail-closed media screening.
Vibes does not currently offer arbitrary audio/video uploads.

**Wallet:** Paystack funding methods are controlled by the provider and
merchant configuration. Webhook and reference-verification paths exist; an
actual production top-up, bank transfer, or USSD payment must be separately
tested against the configured merchant account. Do not claim all methods
are enabled solely because the Paystack pop-up is integrated.


## 5. Notifications and Web Push

Signed-in users have a full Notifications page plus optional standards-based Web Push. The in-app notification row remains the source of truth; browser push is a best-effort delivery channel and can never roll back or block a booking, wallet, escrow, QR, delivery, or dispute transaction.

Push covers:

- Booking and application activity
- Negotiation offers and responses
- New Deals Chat messages
- Escrow funding and wallet events
- Start/completion QR readiness and scan settlement
- Delivery, revisions, approval, disputes, refunds and releases
- Live activity
- Optional marketing notifications, disabled by default

Users enable browser notifications explicitly from **Notifications → Push notifications**. ChombuTar never requests browser permission on page load. One account may register multiple devices. When ChombuTar is visible, the push worker updates the in-app UI instead of showing a duplicate system notification. Notification clicks use same-origin deep links to the relevant Negotiation Center, Deals Chat, deal workspace or Wallet page.

Preferences are available for Deals, Negotiations, Deals Chat, Payments, Live and Marketing. Critical escrow, withdrawal, checkpoint, lifecycle and dispute notifications remain deliverable even if a broad category is disabled.

### Deploying Web Push

The primary setup path is now entirely browser-based:

1. Sign in as an administrator.
2. Open **Admin → Push Setup**.
3. Set the VAPID subject, normally `https://chombutar.vercel.app/`.
4. Click **Generate VAPID keys**.
5. The public key remains visible in Admin. The private key is shown once immediately after generation, then only reported as configured.

The Admin Push Setup automatically creates the required `push_subscriptions`, `notification_preferences`, and `push_vapid_config` tables if they do not exist. The VAPID private key is encrypted at rest using `PUSH_CONFIG_SECRET` when provided, otherwise the existing server-side `JWT_SECRET`. Normal Admin/API reads never return the stored private key.

Environment configuration remains an optional fallback for infrastructure-managed deployments:

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=https://your-production-domain/
```

Database-managed Admin configuration takes precedence over environment variables. `VAPID_PRIVATE_KEY` must never be exposed as a `VITE_` variable. Replacing the VAPID key pair may require existing devices to subscribe again.

The dedicated `/push-sw.js` worker is intentionally scoped to `/push/`, so it coexists with the root Vite PWA worker rather than replacing offline/cache behavior.

### Booking Messages and Price Offers

Book Talent opens `/messages?escrow=<booking-id>`. The header Messages shortcut lists conversations for both clients and talents. My Bookings links to each thread. This release supports talent-hat bookings; client-hat applications keep their existing workflow.

- Only the booking's client and talent can read or send. Cancelled bookings are read-only.
- Before funding, the server rejects detected phone numbers, email addresses, handles, URLs and common obfuscations in both messages and offer notes. Rejected text is not stored or sent in notifications. After `secured` or `released`, contact sharing also requires `contacts_unlocked=true`.
- The filter is heuristic. It cannot guarantee detection of coded language, fragments across messages, or contacts already placed in public profile/media fields. Attachments are not supported in this release.
- Either participant can propose a whole-naira price when the hat is marked negotiable. Counteroffers supersede the previous pending offer. Only the recipient can accept or decline; the sender can withdraw. Acceptance changes only that booking's price, never the public hat price.
- A pending offer must be resolved before funding. Starting card checkout freezes the price and reference; closing the popup does not reopen negotiation. Retry the same checkout from the thread. A failed provider transaction that cannot reuse its reference requires operator reconciliation before another checkout is allowed. Wallet funding is unavailable once card checkout starts.
- Both payment paths check the displayed price against the locked database row. Webhook/callback retries use the same payment reference and cannot apply twice. Contact information stays hidden until the server verifies funding.
- Messages have a 2,000-character limit, 50-item history pages, client retry tokens, and a limit of 20 sends per participant per booking per minute. The active thread polls every 8 seconds; older-history reading pauses polling until Return to latest messages. Messaging requires a network connection; private API responses are not cached by the PWA.

The feature uses the existing serverless routes, retaining 12 deployed API functions:

| Route | Purpose |
| --- | --- |
| `GET /api/escrows?conversations=1&before=<optional-booking-id>` | Participant inbox, 50 bookings per page |
| `GET /api/escrows?messages=1&escrow_id=<id>&before=<optional-message-id>` | Thread, pending offer, permitted contact fields, history |
| `POST /api/escrows` | Actions `send_message`, `make_offer`, `respond_offer`, `read_messages` |
| `POST /api/escrows/:id/prepare-checkout` | Freeze amount/reference; requires `expected_amount` |
| `POST /api/escrows/:id/fund-wallet` | Debit the accepted amount; requires `expected_amount` |

Message and offer sends require `escrow_id`, `body`, and UUID `client_token`; offers also require integer `amount` and `expected_offer_id` (null when no offer is pending). Offer responses require `offer_id` and `status` (`accepted`, `declined`, or `withdrawn`). Read acknowledgements include `through_id` from the loaded message page.

### Migration and Verification for This Release

Run `npm run db:migrate` against the intended Neon database **before deploying this version**. The migration adds `booking_messages` and checkout fields. On the first upgrade only, it freezes prices on existing unfunded bookings because an older client may already have opened a payment popup. Newly created bookings remain negotiable. Rerunning the migration preserves those new bookings. Operators should reconcile old outstanding payments before cancelling or replacing an old checkout.

Run `npm run verify` for integration tests, serverless syntax checks, and the PWA build. Local tests use an isolated in-memory PostgreSQL engine (PGlite); no Neon credentials are needed. CI also runs against PostgreSQL 16 with independent connections to test competing writes. Setting `TEST_DATABASE_URL` uses a temporary database created and deleted by the test harness; its database user must be able to create databases. Tests never use `DATABASE_URL`.

For the client/talent browser test, run `npx playwright install chromium` and `npm run test:ui`. It starts isolated fixture and Vite servers on ports 3000 and 5179, checks five screen widths, exercises counteroffer, QR settlement and dispute review, and writes screenshots under `test-results/`. The fixture accounts exist only in the temporary test database. CI runs this check and uploads its screenshots.

Payment verification follows [Paystack's server-side verification guidance](https://paystack.com/docs/payments/verify-payments/); negotiation and checkout share [PostgreSQL row locks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS).

### Delivery, Revisions and Disputes

Manage a funded booking in My Deals and Messages. The client pays the agreed amount up front into escrow. In **Active Deals**, the client generates a start QR and presents it to the talent. The talent scans it (or enters the displayed code) to mark work started: **30%** of the booking is credited to their ChombuTar wallet, and the rest remains held in escrow. QR codes expire after five minutes; generating another code invalidates the previous one. Only the authenticated talent for that booking may redeem a code, and each checkpoint is single use. Amounts are whole naira, so 30% is rounded down and the exact remaining balance is paid at completion.

Only after the start scan may the talent submit work with a delivery note. The client may request revisions or approve the latest submission. **Approval does not release the remaining funds**: it enables a completion QR in My Deals. The talent scans the client's completion QR to credit the remaining balance to their wallet and close the booking. Existing bookings already submitted before this migration keep their submission and release their full unpaid balance through the completion QR. Delivery notes are plain text and can include links after funding; file attachments are not supported. Scanning proves that the client presented the code; the platform cannot independently prove that work was performed.

Either party can open a dispute while funded and unsettled, including before the start scan or after approval but before the completion scan. The remaining escrow stays held and the work state becomes `disputed`; QR redemptions and ordinary release, revision and delivery actions are blocked. Both participants can continue messaging to provide evidence. Opening a dispute discloses that admins can read that booking's conversation and history. The admin **Disputes** tab provides a paginated oldest-first queue, both parties' messages, offers, and delivery/revision history. An admin who participates in the booking cannot resolve it; another admin is required.

Admin decisions require a written reason and a confirmation. The supported outcomes release or refund **only the amount still held in escrow**. An initial 30% already paid into the talent wallet is not returned by a dispute refund. **A wallet refund is not a Paystack card/bank reversal.** The existing wallet withdrawal workflow remains separate. Refunds close the conversation to new messages and hide profile contact fields; contact information already shared cannot be taken back. The original payment reference stays attached so delayed payment callbacks cannot fund the booking again.

The booking row is locked before a wallet row. Each QR redemption, wallet credit, ledger entry, lifecycle event and notification commits together. A hashed QR token is stored in Postgres; the original is returned only to the client who generated it. Other lifecycle actions require a UUID `client_token`, integer `expected_version` from the current thread, and a `note` of up to 2,000 characters (optional only for client approval). Reusing an identical token/request is a no-op; changing it or acting on a stale version is rejected. Separate unique ledger indexes prevent duplicate 30% credits and double final release/refund.

| Endpoint | Action |
| --- | --- |
| `POST /api/escrows/:id/submit_delivery` | Talent submits or resubmits work |
| `POST /api/escrows/:id/request_revision` | Client requests changes to the latest submission |
| `POST /api/escrows/:id/generate-qr` | Client issues `start` or `completion` QR, only at the appropriate funded work stage |
| `POST /api/escrows/:id/redeem-qr` | Authenticated talent submits QR token; credits the matching escrow portion |
| `POST /api/escrows/:id/approve_delivery` | Client approves delivery and enables the completion QR |
| `POST /api/escrows/:id/open_dispute` | Participant opens a case and holds funds |
| `GET /api/escrows?messages=1&escrow_id=...&events_before=...` | Participant history, 50 events per page |
| `GET /api/admin?action=disputes&status=open&before=...` | Admin queue; also supports `released` and `refunded` |
| `GET /api/admin?action=dispute&escrow_id=...` | Case details; `before` and `events_before` page its evidence |
| `POST /api/admin` | `resolve_release` / `resolve_refund`, plus `escrow_id` and the version/token/note fields |

The old `/release` endpoint uses the same approval rules and request fields; it does **not** release wallet funds. An older cached PWA cannot bypass either QR scan or an open dispute. The deployment still uses the existing escrow serverless route.

#### Deploying QR settlement

1. On an existing database with booking completion already installed, run **`npm run db:migrate:qr-settlement`** with the intended `DATABASE_URL` before deploying the new code, or execute the complete `db/booking-qr-settlement.sql` file in the Neon SQL editor. It is transactional and rerunnable; existing secured bookings in progress become `awaiting_start`, and previously submitted bookings stay submitted. Fresh installations use `npm run db:migrate`, which includes the QR migration.
2. Deploy the code and refresh the installed PWA. Fund a test deal with the client; generate the start QR and redeem it as the talent. Verify a 30% wallet credit, then submit, revise, approve, generate the completion QR, redeem it, and confirm that exactly the remaining amount was credited. Test a dispute after the first scan: an admin refund should return only the held balance.
3. If rollout fails after the migration, fix forward. Do not redeploy the previous full-release handler against partially paid bookings or drop the ledger constraints.

`npm run verify` covers migration upgrades/reruns, legacy roles, permissions, stale versions, retries, competing settlements, audit failure rollback and delayed callbacks. `npm run test:ui` covers the full client/talent/admin lifecycle at mobile and desktop widths, including the resulting wallet balance. Local fixture accounts and funds are isolated test data. Production Neon migration and live Paystack/bank checks require deployment access and are not performed by these tests.

## 6. Local development

```bash
npm install
npm run db:migrate
npx vercel dev
```

## 7. Deploy

```bash
npx vercel --prod
```

Build: `npm run build` → `dist`. SPA rewrites in `vercel.json`.

## 8. Locked product rules

1. Open custom categories  
2. Dual toggle Creator ↔ Employer (`chombutar_role`)  
3. Portfolio required for Talent; optional for Client  
4. Verified if name ends Ltd/Plc/Corp/Inc/LLC  
5. Escrow = price_min  
6. Showroom sort: bookings + orbit_score + likes; top = Host  
7. Cards: minmax(260px,1fr), gap 18px, max 300px  
8. No platform fees (v4.0)

## 9. API

- `GET/POST /api/hats` — list (filters) / create  
- `GET /api/hats?categories=1` and `POST /api/hats { action: "create_category" }` — categories  
- `GET/PUT/DELETE /api/hats/:id`  
- `GET /api/showroom`  
- `POST /api/escrows` · `/api/escrows/:id/fund` · `/api/escrows/:id/release`  
- `GET/POST /api/admin` — admin dashboard/actions  
- `GET /api/auth/profile?action=notifications` — signed-in user's notification inbox
- `PUT /api/auth/profile { action: "mark_notification_read" | "mark_all_notifications_read" }`
- Auth: `/api/auth/register|login|logout|me`

## Flow

Register → Create Hat → Browse (toggle role) → Book/Apply → Escrow (price_min) → Fund → Contacts unlocked → Work (anti-leak) → Release 100% to talent.

## Hat visibility in the Bento feed

Before deploying the feed toggle update to an existing database, run
`npm run db:migrate:hat-feed` with `DATABASE_URL` set. Fresh installations get
the column from `db/schema.sql`. The migration is safe to repeat.

The Create Hat form ends with **Show in Bento feeds**, off by default.
Owners can enable it before publishing and change it later using **Show in feed**
in My Hats (grid or list view). Existing Hats start hidden when the migration
first adds the column. Range-priced Hats require confirmation of
“A negotiation fee applies” before publication; cancelling leaves the Hat
hidden. This notice does not charge a wallet or define a new fee amount.
Changing a published Fixed Hat to Range turns feed visibility off until the
owner confirms through the toggle. My Hats, Showroom, and profile listings
remain available regardless of the feed setting.
