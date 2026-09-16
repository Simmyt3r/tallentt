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

## 5. Notifications

Signed-in users get an in-app header inbox for important marketplace events:

- New applications on client hats
- Accepted or rejected application decisions
- Secured and released booking escrows
- Wallet top-ups and withdrawal status changes
- Admin moderation and reconciliation updates

The inbox intentionally ships as in-app notifications first. Email, SMS, and push notifications should wait until messaging, abuse controls, and user notification preferences are stable.

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

For the client/talent browser test, run `npx playwright install chromium` and `npm run test:ui`. It starts isolated fixture and Vite servers on ports 3000 and 5179, checks five screen widths, exercises counteroffer through contact unlock, and writes screenshots under `test-results/`. The fixture accounts exist only in the temporary test database. CI runs this check and uploads its screenshots.

Payment verification follows [Paystack's server-side verification guidance](https://paystack.com/docs/payments/verify-payments/); negotiation and checkout share [PostgreSQL row locks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS).

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
