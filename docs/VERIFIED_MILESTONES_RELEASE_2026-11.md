# ChombuTar verified milestones — implementation and launch controls (November 2026)

## What is implemented

The **Verified Orbit milestones** migration is an additive, forward-only record of server-verified evidence. It does not backfill historical events, change wallets or commissions, alter ongoing agreements, or transfer sponsor funds. The existing one-card, two-role Work Pass remains the public score view.

| Verb | Credited after | Points | Future Hat unlocks, once per actor–Talent–verb pair |
| --- | --- | ---: | ---: |
| Showcase | First eligibility of a published Talent Hat with cleared media | +0.1 to Talent | 0 |
| Discover | Intentional Hat open, >=5 seconds server-timed active samples and a real Like/KeepUp/second Hat opened after start | +1 to Talent | 2 |
| KeepUp | Existing migration's first verified follow; unfollow reverses, refollow restores points without more slots | +1 to Talent | 3 |
| Book | Work marked completed **and** escrow released with a successful talent-wallet release posting | +5 to Talent | 10 |
| Collab | Completed paid escrow plus independent in-app confirmation from **both named participants** | +3 to each Talent/Client lane | 6 per eligible beneficiary |
| Hire | Both parties accepted the employment agreement, at least one salary period confirmed, and both confirmed the Hire Seal | +10 to each Talent/Client lane | 10 per beneficiary |
| Sponsor | Matching successful wallet sender debit and Talent recipient credit plus both confirming the Sponsor Seal | +5 to Talent | 10 to Talent |

These reward values implement the working product-owner proposal; **no automatic financial charge is introduced by Seals**. The same pair earns promotional slots only once per verb; later separate paid sources may still earn source-specific work points. Credits from each verb are capped at ten lifetime slots per beneficiary. The initial allowance is 10 Hats; pre-migration users with more Hats retain their current capacity. Hat creation locks the user row and rejects simultaneous creations beyond the allowance. Deleting existing Hats is not forced.

**Important:** A reported bank transfer or cash salary is not independent bank verification: a Hire award records both parties' salary confirmation and in-platform Seal acceptance. An in-platform Seal is a consent record, not an external legal e-signature. Where stronger assurance is required, obtain it before commercial rollout. Sponsor evidence is a *separate settled peer wallet transfer*, not the gross amount of an escrow, and only verified platform fees belong in income.

## Activation steps

1. Deploy the code together with `db/patch-orbit-verified-2026-11.sql`.
2. In **Admin → Database Migrations**, verify the target database and apply the prerequisites: `associates-2026-10`, `orbit-milestones-2026-11` (KeepUp), `wallet-peer-transfers-2026-11` for Sponsor, and `employment-2026-10` for Hire. Make sure the existing base schema, booking-completion and relevant billing migrations are already installed.
3. Apply `orbit-verified-2026-11` with the Admin's checksum confirmation. **Until this migration is applied, legacy Hat creation remains available** to prevent a deployment outage. The quota becomes server-enforced immediately when the migration is installed; the migration snapshots current Hat counts as grandfathered baselines. New users then begin with ten available slots. Do not advertise quota activation before migration.
4. Test with non-production users: publish a cleared Hat, open an unrelated Talent Hat from Showroom, stay actively visible and Like/KeepUp/open another Hat, then inspect the Talent Orbit evidence. Create a sealed, completed paid deal; check Book only after settlement. Create a Collab/Hire/Sponsor Seal from an existing source and have the other participant accept it.
5. Review **Admin → Orbit & Hat Review → Discovery reviews**, including a new-account held event, appeal, approval and rejection. Check that reviewer actions have audit reasons; no automatic points are issued for held claims.
6. Run `node --test tests/verified-milestones.test.mjs tests/keepup-milestones.test.mjs`, `npm run check:api` and `npm run build`; review CI before merging/deployment. Retain existing unrelated CI failures as release blockers.

## Discovery verification limitations and fraud treatment

- The server requires an explicit detail-open API call, account-scoped session, minimum five seconds of active heartbeat sampling over server time, and a later persisted Like/KeepUp/second-Hat action. Autoplay, scrolling impressions, self-visits and client-supplied timers never issue points.
- A first viewer–Talent award is database-unique. Rate limits cap session starts; younger accounts, mass daily claims and anomalous surges are held for manual review. Talent or viewer may appeal once with reasons. Admin approval does not bypass unique pair rules.
- Browser visibility and heartbeats are **not cryptographic proof of human presence**. A determined bot can imitate them, and coordinated old accounts may still evade current rules. Stronger anti-sybil detection, suspicious identity linkage, moderation/appeal procedures, and operational monitoring are required before large-scale or public claims that Discover is fraud-proof.
- Verified award revocation is admin-only and audited, and revoked credits no longer add Hat capacity. No historical score is rewritten without a recorded review decision; no auto wallet debits or funds clawback take place.

## Known technical and product gates

- The first release provides a dedicated **/milestones** page for slots, Seal creation/signing and Discovery appeals. Verified source IDs are drawn from existing Deal, Employment or Wallet records; better source-picker affordances can follow.
- Admin can review held discoveries via the Orbit panel. Award revocation exists as an authenticated Admin action but does not yet have an in-panel event search/entry form.
- The baseline six-factor Orbit score continues alongside milestone event points. This makes work-related evidence additive to the legacy activity calibration; management should review any overlapping reputation weights before publishing a marketing explanation.
- Work Pass printing still requires its pre-existing paid salary-tracking conditions; earning Orbit/Hat credits does not bypass billing, verification or printing policy.
- Payment reconciliation and anti-fraud signoff remain launch gates. Do not move escrow or payroll money, retroactively charge old deals, or claim actual income from Sponsor principal because of these awards.
