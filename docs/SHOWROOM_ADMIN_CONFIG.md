# Showroom Settings: Admin-managed configuration

The Admin panel now has **Showroom Settings** (`/admin?tab=showroom-config`).
The four requested values are configurable there:

| Setting | Admin field | Storage |
|---|---|---|
| `CLOUDINARY_CLOUD_NAME` | Cloud name | Plain non-secret name |
| `GOOGLE_CLOUD_VISION_API_KEY` | Replaceable API key | AES-256-GCM encrypted |
| `SHOWROOM_WORKER_SECRET` | Replaceable or generated | AES-256-GCM encrypted |
| `SHOWROOM_MEDIA_SCREENING` | Off / Enforced toggle | Boolean |

Configuration is stored in PostgreSQL, not placed into Vite/client-side variables.
The API key and worker secret are **never returned by configuration read APIs**.
A freshly generated worker secret is displayed **once** to the administrator so
they can copy it into GitHub Actions. Subsequent API reads show only its presence.

### Production prerequisites

1. Apply `npm run db:migrate:showroom-config` after the earlier Showroom migrations.
2. Keep the server's `JWT_SECRET` (existing auth secret) configured. For future
   key rotation, preferably configure `SHOWROOM_CONFIG_ENCRYPTION_KEY` as a
   separate server-only encryption root. Do not rotate that root without
   migrating/re-encrypting the stored secrets. It cannot be managed from the
   Admin panel because doing so would defeat encryption at rest.
3. Open **Admin → Showroom Settings**, enter the Cloudinary cloud name matching
   the uploader, save the Google Cloud Vision API key, then generate a worker
   secret.
4. Copy the worker secret to GitHub repository secret
   `SHOWROOM_WORKER_SECRET`. Configure `SHOWROOM_WORKER_URL` to your deployed
   app's base URL. Set the repository variable `SHOWROOM_SCREENING_ENABLED=true`
   after testing the scheduled workflow.
5. Enable Showroom media screening from the Admin switch. No Vercel redeploy is
   required for this setting; future requests read the persisted configuration.

The old environment variables remain **fallbacks** when an Admin-managed value
has not been set. A database toggle overrides the environment's enforcement
mode. The existing uploader's `VITE_CLOUDINARY_CLOUD_NAME` remains a build-time
client variable; the Admin field controls the **moderation lookup**, not the
Cloudinary upload account. They must match.

A configured status means the value is present and has passed local format
validation. It does **not** guarantee Google Cloud Vision billing, quota or API
permissions are enabled. Test the actual worker after configuration.

### Security and operational limits

- Do not commit real keys to GitHub or paste them in a bug report.
- Server-only encrypted secrets are protected by the server encryption root.
  Database access plus the running server's secret can decrypt them.
- Worker secret rotation must be followed by an immediate matching update in
  GitHub Actions or scheduled moderation will stop.
- Without a configured worker trigger, enforced media remains pending, so do
  not enable screening before successful worker testing.
- Media moderation and the upstream Google Cloud Vision provider may incur
  API charges. Assess usage, consent/privacy requirements and quotas before
  switching enforcement on.
- This is a small-scale scanning pipeline, not a verified million-user
  architecture; a durable autoscaled worker is still required at high volume.

