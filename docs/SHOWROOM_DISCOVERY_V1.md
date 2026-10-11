# ChombuTar Showroom Discovery & Moderation V1

## Implementation status

This release establishes the **automated publication + exception review** architecture. It does not implement OCR, automated image/video safety scoring, or machine-learned personalized recommendations yet. Those require separate services, evaluations and monitoring before a million-user rollout.

### User discovery

- New accounts default to Showroom; remembered preferences stay scoped to the account.
- Bento uses `/bento`; Showroom uses `/showroom`.
- Showroom offers For You, Trending, Near You, New & Rising, category, and search.
- The server returns 24 records per page using a stable keyset cursor rather than scanning more pages with OFFSET.
- Active Talent Hats must have portfolio media. Obvious contact-sharing text is filtered from discovery.
- For You and Trending are **heuristic rankings**, not learned personalization. User likes/bookings are capped in the score so one account cannot indefinitely dominate.
- Existing My Deals, Negotiation Center, Deals Chat, QR and escrow responsibilities remain separate.

### Creator appearance

- Creators customize appearances from **My Hats → Customize appearance**.
- Eight approved Bento accents. Five controlled Showroom layouts: Minimal, Bold, Media First, Editorial, Dark.
- Styling uses a per-Hat `hat_presentation` row. The database rejects unapproved values; the server also validates them.
- No arbitrary CSS, HTML, contact badges or user-uploaded Bento poster markup.
- Existing listing content, price, booking flow and escrow presentation remain platform-generated.
- The presentation table is automatically initialized on the first saved customization. New installs also include it in `db/schema.sql`.

### User reporting, not manual approval

- Signed-in users can report a Showroom listing for contact bypass, spam, impersonation, unsafe content or other.
- An owner cannot report their own Hat, reports require an active Talent Hat with media, and every reporter can submit only one report per Hat.
- Each account can submit at most 20 new reports in 24 hours.
- At three distinct reporters, the listing is queued under **Admin → Showroom Reports**. Reporting **does not automatically ban, hide or suspend** a listing; a malicious group must not be able to remove a competitor merely by mass-reporting.
- Admin may dismiss reports or restrict a listing after inspecting it. Restriction disables the Hat using the existing active flag and sends the existing moderation notification.
- Reviews create entries in `admin_audit_logs`.
- Tables `showroom_reports` and `showroom_review_state` initialize on the first report (and exist in the full schema for fresh installs).

### Performance and safety limitations to resolve before very large scale

1. **Image/video moderation and OCR:** detect embedded phone/WhatsApp details and harmful media asynchronously; manual exceptions for uncertain cases.
2. **Trust-weighted reports:** use account age, verified work and abnormal reporting patterns to prevent a few linked accounts from overwhelming the review queue.
3. **Precomputed discovery index:** current rank calculations and regex eligibility filters still run against live Hats; move to asynchronously maintained/indexed features and measure query latency at millions of records.
4. **True For You personalization:** combine categories, location, fresh content, views, completions and interests with exploration and cold-start protections.
5. **Reporting appeals and user transparency:** author notices, appeals and outcomes with audit history.
6. **Production safety:** rate limits beyond the basic daily count, image-moderation failures, telemetry, saturation tests and repeatable migrations.

## Validation

`npm test`, `npm run check:api`, `npm run build`, and mobile/desktop booking UI tests are the gate. Do not advertise million-user scale as validated until the index and load-test work above is complete.
