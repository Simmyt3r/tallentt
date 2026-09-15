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

This creates `users`, `categories`, `hats`, `hat_media`, `applications`, `escrows`, `wallets`, `wallet_transactions`, `notifications`, `admin_audit_logs`, `leak_attempts`, and seeds default categories.

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