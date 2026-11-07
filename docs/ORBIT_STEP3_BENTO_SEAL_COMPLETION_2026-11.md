# Step 3 follow-up: consistent Discovery surfaces and verified Seal choices

## What is now connected

Signed-in users who **deliberately open** an eligible Talent Hat from the Bento Feed, a shared `/hat/:hatId` link, or the `/talent/:hatId` Talent Profile use the same server-governed qualified Discovery mechanism as Showroom. Merely seeing a card, landing on a guest-only page, scrolling, viewing Work Pass or counting a video view never awards points.

- **Start** on explicit detail mount; only if the current viewer is not the Hat owner and the Hat has a Talent role.
- **Dwell** requires the existing server-timed active heartbeat samples spanning at least five seconds. Hidden pages do not heartbeat.
- **Small proof** must be a successfully persisted Like, KeepUp, Save, a confirmed copied/native Share action, or deliberate opening of a second approved media asset. Shared URLs are not proof of external receipt.
- **Awards** stay wholly inside the existing server-side transaction: +1 Talent Discover, +1 viewer Explorer, once per pair, and +2 Talent Hats under the existing per-verb limit. Anti-fraud holds, appeals and revocations are unchanged.
- **Guest** public browsing stays ungated for reading; no guest has a qualifying session or Orbit credit.
- Bento and Profile now expose **Save Hat** with DB-persisted status, and Bento detail has Share and selectable media proofs. The same Bento detail powers signed-in `/hat/:hatId`.

The standard Hat details API includes the Hat media ID and screening status needed for the server to validate a real second-media selection. This does **not** add a media upload or payment flow.

## Verified Seal choices

The Milestone Center shows a **server-filtered list of eligible completed records** for Collab (completed released work plus successful payout evidence), Hire (two-party accepted employment plus confirmed salary period), and Sponsor (both sides of a successful wallet transfer), all subject to the existing Seal rules. Only named transaction participants receive a choice. A record with an existing pending, sealed, or cancelled Seal is not offered again. The existing paste-UUID option remains for older/exceptional records and is validated by the same server source-evidence checks.

Options contain a non-secret source UUID, category label, counterparty username and source date, with **no private salary terms or wallet balance leaked**. No money movement occurs when listing or signing a Seal.

## Testing and rollout

- Database regression tests verify that unpaid/unconfirmed sources are absent and outsider accounts cannot enumerate another pair's records; a created Seal disappears from new choices.
- A dedicated UI/code guard verifies all three signed-in detail surfaces still use the verified lifecycle.
- CI, Quality Gate, browser UI and production build must pass before merge.

**No new migration** is added by this follow-up. Production still needs its existing **orbit-verified-2026-11** and **orbit-explorer-proof-2026-11** migrations checked through Admin, with a backup and signed-in test users.

## Still open for product-owner sign-off

- Whether pre-verified Base Orbit completion factors and verified Book points should coexist or be rebased; changing them retroactively without approval would affect existing scores.
- Precise Showcase cycle interpretation, Hall of Fame Top 10 vs Top 20, hat levels and work-linked fee reductions/bonuses.
- Stronger anti-abuse signals and beta monitoring beyond the existing rate limits and manual review.
- Commercial accounting, service charges, monthly tracking invoices, refunds and customer-liability separation belong to Step 4.
