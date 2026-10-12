# Signed Hat Media Uploads: Production Rollout

## What changes

New Hat media can now be uploaded using a signed Cloudinary POST. The API
issues a unique, 1-hour public ID belonging to the authenticated user,
and the client sends the exact signed parameters directly to Cloudinary.
On Hat create/edit, the API verifies the actual asset using the authenticated
Cloudinary Admin resource API, ensures its public ID and delivery URL match
the permit, and claims the permit exactly once in the same PostgreSQL
transaction as the Hat/media write.

The browser never receives the Cloudinary API secret. All signed upload
fields come from the server, not the browser. Existing media can be retained
on edits without a second upload. New unsigned media are refused when
enforcement is active.

### Existing route reuse

The new signed permit action is `POST /api/hats` with
`{ "action": "upload_sign", "mime": "image/jpeg", "bytes": 153600 }`.

It is authenticated and returns a signature, the API **key** (public for
signed uploads), an upload permit UUID, and the server-chosen `public_id`.
No extra Vercel serverless function is needed.

### Rollout flag

**The initial default is OFF**:

```env
HAT_MEDIA_SIGNED_UPLOADS=off
```

With the flag off, the existing unsigned preset continues to work.
With `enforce`, the Hat form uses server-signed uploads and the Hat API
rejects new media that are not verified against a user-owned permit.

This rollout flag is intentionally server-only. Do not enable while the
database migration or Cloudinary API credentials are missing.

## Before enabling

1. Deploy the code, and apply `npm run db:migrate:signed-hat-media` to the
   **same database used by the deployed Vercel app**.
2. Configure the following **server-side** Vercel settings:
   `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
   `CLOUDINARY_API_SECRET`. They must correspond to the same Cloudinary
   account. Do not expose `CLOUDINARY_API_SECRET` as a Vite variable or
   place it in Admin or the browser.
3. Confirm the existing Cloudinary account supports API-authenticated asset
   resource lookups (Admin API access and quota).
4. Deploy **with the flag off**, run normal Hat create/edit tests, then switch
   `HAT_MEDIA_SIGNED_UPLOADS=enforce` in Vercel.
5. Run a signed test upload from an ordinary authenticated Talent account,
   publish its Hat, and verify it appears only after configured moderation.
   Confirm a second user's account cannot claim that media.
6. Confirm a returning owner can edit the title/caption or reorder existing
   media without uploading them again.
7. Check logs and Cloudinary usage/cost. If there is a problem, set
   `HAT_MEDIA_SIGNED_UPLOADS=off` temporarily; the earlier unsigned path
   resumes. The database migration is reversible operationally by disabling
   the flag. Do not delete the permits table because it contains the audit
   of already claimed uploads.

**Important**: The old unsigned preset should be disabled in the Cloudinary
Console only once signed uploads are verified. If it remains public, clients
can still upload assets directly to the cloud, although enforced Hat
attachment will reject them without a valid server permit.

## Boundaries and known limits

- Signed requests prevent impersonating a different user in Hat attachment,
  forging a Cloudinary media URL, and reusing a permit once it is claimed.
- A permit is valid for one hour. The backend verifies the asset's public
  ID, type, nonempty byte count (up to 20 MB), version, and exact secure URL.
- Per account, at most 60 signed permits can be issued each hour.
- Signed uploads do **not** stop a malicious user from submitting harmful
  bytes to Cloudinary before moderation; Cloudinary-side size limits,
  security controls, and abuse protections still matter.
- Failed or abandoned uploads can leave Cloudinary assets. A lifecycle
  cleanup job and account-level quotas are future work.
- The signed upload API key itself is not secret; the API **secret** is.
- The existing `VITE_CLOUDINARY_CLOUD_NAME` and unsigned preset are
  legacy fallback settings. In signed mode, the server selects the cloud
  for the browser; account-level cloud configuration must still match
  Showroom's moderation setting.
- The low-throughput Showroom screening worker is a separate rollout.
  Signed media authorization does not itself imply safety approval.

## Production gate

Do not merge/deploy as enforcement before reviewing the Cloudinary account
and migration status. A CI-successful branch does not confirm that production
keys, billing or API quotas are ready.

## Release preflight in Admin

Open **Admin → Showroom Settings → Deployment readiness** to check that
all five Showroom tables and required media/listing columns exist. The
panel also checks whether the application has a server-side encryption
root and Cloudinary upload credentials. Click **Test Cloudinary connection**
to make an explicitly requested read-only, single-result Admin API request.
This checks the actual API key/secret permissions without returning provider
data or credentials. The test uses a small amount of Cloudinary Admin API
quota. A green database check does not mean GitHub Actions is configured.

Before enabling `HAT_MEDIA_SIGNED_UPLOADS=enforce`, all migration and
Cloudinary credential checks must pass, and a real end-to-end upload should
succeed on the staging deployment. This is a server-side feature flag
rather than an Admin toggle because misconfiguring the signed upload
credentials would block new portfolio submissions.

## Media format and moderation policy

Client file selection and server upload permits now use one shared allowlist
for JPG, PNG, WebP, GIF, AVIF, MP4, WebM, MOV, MP3, WAV, OGG and M4A.
Unsupported formats fail before a browser uploads the file.

Video moderation currently inspects only a representative frame.
Audio cannot be checked by Google Vision and is automatically held for
**manual review** with reason `audio_requires_manual_review`.
It must never be labeled automatically passed by image-only scanning.
