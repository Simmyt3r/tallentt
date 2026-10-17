# Career Passport and verifiable work history

This is the **proposed** trust architecture for ChombuTar, informed by a
hypothetical Musa the welder story in Abuja. No named institution or employer
has been integrated or has endorsed, signed or co-signed a credential merely
because it is mentioned in a design example.

## Current implementable card layout

A subscriber has one persistent profile and may own any number of separate
Talent or Client Hats. Every Hat remains bookable/applicable independently.
Opening one displays three separately sourced groups:

1. **Profile information** — owner identity, self-authored long-form profile
   statement, geographic region and permission-gated contact details.
   Short bio/headline/tagline is not falsely substituted for the statement.
2. **Performance records** — separately computed activity Orbit score (currently
   **0–100**, not 250/650), released Talent jobs, released Client hires, and
   the number of currently disputed deals. Open disputes are *not* a finding
   of misconduct. Claims of external qualifications do not acquire a
   verification tick by being self-declared.
3. **Job information** — the *selected Hat* name, Hat type and its applicable
   duration (omit duplicate duration for One-Off), its own location,
   requirements, pay unit and pricing, and aggregated applications to
   that particular Hat. No other Hat's applications, date or price is merged.

Entertainment-only Vibes/Showroom media links to the author's profile. It
must not be treated as an active job listing unless explicitly converted
into a real Hat through the existing publishing and review process.

**Contact security:** Users' raw NINs, bank accounts, background checks and
private phone numbers are not public card fields. Phone is exposed only to its
owner or a counterparty whose actual funded escrow has `contacts_unlocked`.
No unverified business-name suffix should be mistaken for an official
professional credential.

## Proposed future identity and qualification verification

- Approved, trained ChombuTar reviewers verify evidence and keep minimum
  audit references; NIN handling must use a duly authorized verification
  provider and comply with applicable Nigerian privacy obligations.
- An institution like ITF or COREN may *only* co-sign credentials after a
  signed agreement, verified issuer identity, delegated authority and an
  independently verified digital signature. Red Seal is not integrated.
- Credentials have a signed issuer record, exact qualification, scope,
  subject binding, expiry, revocation state and evidence hash.
  A QR code opens a public verification URL showing only consented fields
  and a live revocation check. **A content hash alone is not a signature**.
- Never mint institution-signed or employer-endorsed badges as mock proofs
  on real user profiles.

## Proposed future work witness and settlement

- A job can define a geofenced site, schedule and supervisor identity
  with transparent user consent and retention limits. GPS within 100m
  is **not** reliable proof of attendance by itself; location can be spoofed
  and mobile devices can be shared. Supervisor confirmation, anti-replay,
  device binding, sampled audits and dispute review are also required.
- Logs for location and supervisor attestations should be encrypted,
  time-bound, access-controlled and subject to correction/appeal.
- Funds must remain in reconciled escrow until the parties' actual,
  consented release conditions are met. Payment webhooks must be
  idempotent, settlement journal balanced and disputes able to freeze
  release before a payout. The story's 90/10 split is **illustrative**,
  not a live ChombuTar fee or automatic disbursement rule.
- A completed-job credential may be issued from real settlement and
  performance evidence; any disputed or revoked badge needs fair notice,
  an appeal path, independent review and an auditable reason. No automatic
  misconduct label should result from a mere complaint.

## Release checklist for the currently implemented card details

1. Apply `db/patch-card-detail-2026-10.sql` using Admin → Database Migrations
   before deploying code that selects the new columns.
2. Create/edit a Talent Hat and a Client Hat with separate tagline and
   service details/job requirements. Edit a profile statement.
3. From BentoField and Showroom, verify the same owner-level profile and
   performance across different Hats, but distinct Hat-specific requirements,
   price, time, location and application counts.
4. Confirm another user's phone is hidden until that viewer is in a
   funded, unlocked escrow with that exact owner; it remains hidden
   from anonymous and unrelated sessions.
5. Test One-Off handling, concurrent/independent Hat applications,
   mobile layouts, and database migration/reversal strategy.
6. Check the existing CI/build gates; a successful Git commit alone
   is **not** a production release or a live third-party verification.
