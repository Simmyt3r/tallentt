# Showroom Media Screening: deployment and safety

## Delivered in this change

- Persisted media queue with atomic PostgreSQL job claiming and stale-lease recovery.
- New media enter **pending** only with `SHOWROOM_MEDIA_SCREENING=enforce`. Existing legacy media are not forcibly hidden or reprocessed.
- Server-side Google Cloud Vision OCR and image SafeSearch, plus first-frame analysis for videos.
- Holds for apparent embedded contact information, high-confidence visual-risk signals, unsupported sources, exact public-ID reuse across creators, and repeated scanner failures.
- A hold hides the affected Hat **only from Showroom discovery**, not from My Hats or existing escrow/deals.
- Admin exception screen to inspect and approve/reject media, with audit logs.
- A creator can request an exception appeal for held or rejected media; a human admin can approve the appeal and reinstate those assets without manually approving routine submissions.
- Rate-limited small-batch, secret-authenticated worker in the existing `/api/showroom?worker=1` function.
- Idempotent `db/showroom-media-screening.sql` upgrade and automated regression tests.

## Setup

1. First apply `npm run db:migrate:showroom-media` with `DATABASE_URL` set, or run `db/showroom-media-screening.sql` through the PostgreSQL console.
2. Enable the **Cloud Vision API** in your Google Cloud project and obtain a restricted server-side API key. Configure `GOOGLE_CLOUD_VISION_API_KEY` in Vercel, not in the browser.
3. Set the correct `CLOUDINARY_CLOUD_NAME` that owns uploaded media.
4. Create a fresh 32+ character secret and set it as `SHOWROOM_WORKER_SECRET` in Vercel.
5. In GitHub Actions repository secrets, configure `SHOWROOM_WORKER_URL` (your deployed base URL, HTTPS) and the same `SHOWROOM_WORKER_SECRET`. The workflow `showroom-media-screening.yml` executes every 15 minutes after merge into the default branch, and also allows manual dispatch.
6. Once the worker has passed a controlled deployment test, set `SHOWROOM_MEDIA_SCREENING=enforce` in Vercel and redeploy. The default `off` mode keeps previous behavior.
7. Inspect held assets under **Admin → Showroom exceptions → Media screening exceptions**.

The worker authorization is separate from user/admin sessions. Do not expose the worker secret in client `VITE_` variables, Git commits, or query parameters.

## Failure behavior

- New media remain hidden from Showroom until checks pass.
- Temporary Vision errors are retried with backoff, maximum three attempts; recurring failures become held exceptions.
- A missing Vision API key in enforce mode results in a server error for the worker, leaving new assets pending rather than silently publishing.
- Existing approved media on an edited Hat keep their prior screening result when their URL and public ID do not change.
- An admin who approves held media takes responsibility for inspecting it. Automated detection never bans an account.

## Known limits

- Video safety checks analyze **only the first video frame**; a full video moderation service is still needed.
- OCR can miss stylized contact information and misinterpret ordinary numbers. Human override is necessary.
- Public Cloudinary `imageUri` analysis can intermittently fail if a provider cannot fetch the image; treat the resulting hold as a recoverable exception.
- Exact same-asset detection by public ID is **not** perceptual hashing or visual duplicate detection.
- No learned risk scoring, linked-account trust graph, or large-scale personalized ranking is included yet.
- Unsigned Cloudinary uploads currently rely on client-supplied media metadata. Strongly recommend signed uploads and server-side Cloudinary asset verification before promoting this to broad public scale.
- Media and OCR are sent to Google Cloud Vision for analysis; publish appropriate notice and retention policy before turning enforcement on.
- GitHub Actions scheduled workflows are a small-scale fallback and run only from the default branch. They are not a high-throughput production job runner. Move to a proper message queue and autoscaling consumers at scale.
- The current retry/hold mechanism cannot guarantee near-real-time publication when the queue grows faster than the worker consumes it.

## Validation

Run `npm run check:api`, `npm test`, and `npm run build`. Tests use an isolated PostgreSQL/PGlite database and mocked Vision responses, not live network calls. Treat these as functional regression checks, **not** an accuracy certification of Google's classifiers or a million-user load test.

Reference: https://docs.cloud.google.com/vision/docs/request
