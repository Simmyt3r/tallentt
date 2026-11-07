# ChombuTar Step 3 — Explorer, qualified Discovery and Showcase cycles

**Release intent:** Implement the incomplete evidence-backed Orbit rules from the owner's *Landing + Guest Showroom Design v2* without inventing historical achievements or changing wallet money.

## Exact seven verbs and point policy

The seven verbs remain **Showcase, Discover, KeepUp, Book, Collab, Hire, Sponsor**.

| Source | Qualified beneficiary | Orbit | Hat slots |
|---|---|---:|---:|
| Showcase | Talent publishing approved Hat | +0.1 | 0 |
| Discover | Talent first discovered by a genuine signed-in viewer | +1 | +2 |
| **Explorer** (*Discover mirror*, not eighth verb) | Signed-in discoverer of that Talent | **+1** | 0 |
| KeepUp | Eligible Talent followed by a new account | +1 while following | +3 first follow (max 10 per verb) |
| Book | Talent after released, paid and completed work | +5 | +10 (per-verb max) |
| Collab | Both documented source parties after their Seal | +3 each | +6 (per-verb max) |
| Hire | Both parties after signed employment and confirmed salary period | +10 each | +10 (per-verb max) |
| Sponsor | Talent after reciprocal, successful wallet transfer and Seal | +5 | +10 (per-verb max) |

No cash, discounts or bonuses are paid merely for Orbit, Save, views, Likes or KeepUp.

## Definition of Showcase "unlock cycle" (conservative implementation)

A Showcase cycle is a completed group of **ten Hat entitlements**, not a day, a feed refresh or an individual unlocked Hat. The first ten baseline Hat slots permit at most ten +0.1 awards (**+1.0**). Every **additional ten verified unlock credits** permits another ten +0.1 awards (**another +1.0**). Unlocks of +2 or +3 permit publishing their real additional Hats, but **do not immediately reset the +1.0 reward ceiling**. Revoking an old Showcase event does not allow farming its historical slot again. Pre-migration Hats still retain their grandfathered availability, but not fabricated backdated Showcase points.

**Product-owner decision required before real-money incentives:** confirm this precise definition of "unlock cycle" and whether historic users receive any historical credit. The database does not backfill anything.

## Discovery: what now counts

Only a signed-in user intentionally opening an **eligible published Talent Hat**, maintaining a server-timed active visit with at least two spaced heartbeats over five seconds, and completing **one recorded qualifying action** may earn the first-pair Discovery.

1. Like a Hat (an existing durable database event after the open).
2. KeepUp with that Talent (a real follow established after the open).
3. Save the Hat (a real subscriber-owned saved-Hat entry created after the open).
4. Share the Hat (a successful native Share or copied URL, then a durable server record from that authenticated session; a client assertion alone is not independently verified external distribution).
5. Intentionally select the second cleared image/video/audio asset of the opened Hat (server validates the media ID, order and moderation status).
6. Intentionally open another approved Hat belonging to the same Talent (already supported).

Scrolling past, guest reading, autoplay, repeatedly opening Hats, or leaving before the active dwell condition earns **zero**. Only **one verified Discovery per viewer–Talent pair, forever**. Simultaneously and atomically issue the Talent's +1 Discover and the viewer's +1 Explorer; a fraudulent Discovery revocation removes both. Newly created accounts and suspicious volume patterns still enter manual review; fraud decisions and appeals are audited.

The platform can prove that a user clicked its Share flow and stored a server event, **not** that an independent external recipient really saw it. Do not market Share as externally verified. Fraud review still applies.

## Database migration

Admin → Database Migrations → **Orbit Explorer & Proof (2026-11)**.

Prerequisite order: `associates-2026-10` → `orbit-milestones-2026-11` → `orbit-verified-2026-11` → `orbit-explorer-proof-2026-11`.

This SQL creates no payment activity, no cash disbursement, and no retroactive Discovery or Explorer awards. A missing schema causes qualifying Discovery to fail with a descriptive upgrade error, rather than crediting the Talent without the Explorer.

**Do not run on production without** a verified backup, the correct environment/database, an Admin migration receipt and a controlled signed-in test Talent and viewer. A green GitHub workflow does not establish that production migration has been executed.

## Acceptance

- [ ] DB test: one qualified pair receives **+1 Discover, +1 Explorer, +2 Hat slots only on Talent**.
- [ ] Repeat same pair via another Hat: no duplicate scores, quota or Explorer rewards.
- [ ] Unqualified guests or early dwell: no credited events.
- [ ] Save, confirmed Share and second approved media: each qualifies only with valid active session evidence.
- [ ] Held fraud decision: no awards until approved; rejection/revocation removes both source-linked rewards.
- [ ] Showcase stops at +1.0 with only baseline Hat entitlements, then resumes when ten verified new slots have been unlocked.
- [ ] Current Orbit remains uncapped overall; Talent and Client lane scores remain distinct and displayed to one decimal.
- [ ] Work Pass has no Book button; Book remains on Profile/Hat.
- [ ] Admin can inspect and distinguish source-linked revenue from accounting liabilities. No separate cash reward implemented.
- [ ] Test on desktop/mobile and verify actual production Admin migration independently.

## Unfinished items requiring separate releases

- Verified user-friendly source selectors for Collab, Hire and Sponsor Seals instead of entering UUIDs manually.
- Owner policy decisions: precise Showcase cycle rules, Hall of Fame Top 10 or Top 20, level thresholds, discounts/bonuses for real work, historical credits, and commercial fee schedule.
- Signed-in **Bento** and Profile intentional-open evidence should use the same verified Discovery workflow; this iteration extends the Showroom detail flow, not every possible discovery surface.
- Share-outside-platform verification, anti-bot/device signals and abuse limits need real-beta monitoring.
- Formal legal signature, payment settlement and finance reconciliation are Step 4/5 work.
