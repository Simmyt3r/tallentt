# ChombuTar: Seven-verb product decisions and launch acceptance (November 2026)

## Decision record

This is the working requirements and gap-analysis record following the owner's *Chombotar Final Brief* and the follow-up approval. It does not supersede existing contracts or authorize real-money disbursements, fee discounts, or bonus payouts. **Keep existing verified transaction and escrow flows operational while developing the remaining milestones.**

Seven verbs in order: **Showcase → Discover → KeepUp → Book → Collab → Hire → Sponsor**. The owner's documented milestone weights and Hat-unlock amounts are retained as proposed. Management also agreed that: (a) verified work must be distinguishable from engagement; (b) anti-manipulation controls are essential; (c) booking/escrow must be commercial-launch ready; (d) Hits & Vibes should support general discovery *and* Keeping Up; and (e) each source of platform income must be reported separately in Admin, followed by an honest total.

## Existing code / what still needs building

| Milestone | Existing foundation | Work required before declaring complete |
|---|---|---|
| M1 Showcase | Hat form, Showroom, Bento Feed visibility, Gallery | Validate required refined media, optional raw media, field order, editing and moderation in real user journeys |
| M2 Discover | Search, Showroom, Bento Field; event/score infrastructure | Server-authoritative one-time qualified viewer–Talent pair ledger; explicit intentional click, active stay >5 seconds and real user action proof; rate limits, uniqueness and appeal policy |
| M3 KeepUp | `subscriber_follows`, Associates follow/unfollow, **For You / Keeping Up** feeds and forward-only one-time milestone ledger | Remaining: migration activation, coordinated-account fraud/appeals policy, historical backfill approval, production acceptance and future Hat-cap enforcement |
| M4 Book | Booking and escrow APIs, funded/released work, transaction and commission records | End-to-end real-user acceptance, deposit/refund/reversal reconciliation, delivered-work verification, checkout disclosure, dispute and payment-provider integration |
| M5 Collab/Hire/Sponsor | Associates and employment/tracking foundation | Individually verifiable signed Seal types, completion/payment events, cancellation states, consent, fee policies and separate platform-charge event ledgers |
| M6 Work Pass | Single signed Work Pass with distinct Talent/Client Orbit, completed jobs, salary evidence | Governed event ledger, qualification provenance, 1-decimal display, verified Discovery/KeepUp counts and Seal history, anti-fraud checks |
| M7 Hall of Fame | Showroom Top 12 exists, but is not equivalent to Hall of Fame | Define Top 10 vs Top 20, role-eligible ranking, 90-day inactivity calculation, notification policy, honest badges and eligibility appeals |

### Orbit governance — separate reputation dimensions

**No score reset in this release.** ChombuTar currently has an admin-adjustable six-factor Orbit model. The first release exposes three evidence categories under each role, while leaving existing points, tier requirements and user histories unchanged:

1. **Verified work:** completed/released paid bookings credited to Talent; released engagements to Client. Do not treat simply signing an unfunded agreement as completed work.
2. **Showcase & engagement:** publishing evidence, eventually qualified first-time Discovery and KeepUp events. Do not equate views/likes/follows with a completed job in trust claims.
3. **Profile & account history:** profile completeness, reviewed Hat activity and tenure; reviewed Hat is **not** government identity verification.

Show Orbit with one decimal and no upper limit. Preserve one card with separate Talent and Client evidence. User-to-user actions must not transfer reputation between roles.

### Approved new milestone policy — pending verified events and migration

| Verb | Proposed Orbit award | Unlocked *future* Hats eligible for +0.1 |
|---|---:|---:|
| Showcase | +0.1 per eligible published Hat | Initial 10 Hats, then capped per unlock cycle |
| Discover | +1 per verified new viewer–Talent pair | 2 |
| KeepUp | +1 first eligible subscriber–Talent pair; -1 on Un-KeepUp per policy | 3 |
| Book | +5 after finished work and recorded payment | 10 |
| Collab | +3 to each verified party only after signed Seal and completed work | 6 |
| Hire | +10 only after a valid Hire Seal; fraud/reversal checks required | 10 |
| Sponsor | +5 only after valid Sponsor Seal and recorded funding | 10 |

The owner's maximally unlocked Hats per milestone remains **10**. Earned Hats apply to **future eligible Hats** rather than retroactively crediting earlier Hats. No daily resets. Repeated events must not be double counted.

**Open rule conflict to resolve before event-ledger activation:** “same person cannot trigger the same verb twice for the same Talent” may inadvertently prevent repeat paid work from earning work reputation. Proposed split: unique *promotional unlock* per actor–Talent–verb pair, but qualifying separate paid jobs stay independently recorded for work history. Do not silently resolve this conflict in production scoring.

#### Minimum event ledger requirements

- Each event has unique identity, actor, subject, verb, source record, occurred time, verification state, reversal relation, and audited score/unlock policy version.
- Unique pair constraints for Discovery/KeepUp milestone claims; separate idempotency keys for completed Book, Collab, Hire and Sponsor source records; database transactions/locking for claims and reversals.
- On Discover, require first qualifying pair, explicit open click, stay beyond five active seconds **and** a proof action (Like, KeepUp, Save, Share or second Hat). Do not count autoplay, scrolling past, background tabs, unverified client timers, same-account/self-interactions or duplicate/suspected accounts.
- Preserve a historical event even after Un-KeepUp. Current KeepUp follower counts and any net Orbit reversals update without letting a second follow award the same “first” milestone.
- Require server-issued, verifiable source references before awarding work points. Log administrative corrections rather than modifying a score invisibly.
- Rate-limit by account and appropriate abuse signals; implement moderation/appeal review. Avoid claiming device matching as conclusive identity proof.
- Add separate Talent and Client Orbit/Work Pass read models derived from events, never from untrusted client-input totals.

### Hits & Vibes feed decision

Maintain **For You / Discover** (broad discoverable posts, including unfamiliar Talent) and **Keeping Up** (posts from followed Talent). Do **not** replace the entire Vibes feed with followed accounts only. Both tabs require independent pagination, stable return position, moderation and privacy enforcement; direct links to visible posts should continue to work.

**Implementation update:** The two feeds use authenticated follow relationships and server-side filtering; search and pagination are isolated per tab, hidden posts remain excluded, and comments retain the feed return state. With the new **Orbit milestones** migration applied, the first qualified, future KeepUp (active published Talent Hat) credits +1 to the Talent Orbit lane and records +3 *future-Hat unlock credits*. Un-KeepUp writes -1; refollow restores +1 but never awards another three slots. Existing follows are **not** backfilled. Legacy Orbit weights/earned-work evidence remain separate. Followed-feed access still requires the Associates & Inbox migration. **Hat creation limits do not yet consume these credits**; do not market expanded Hat capacity as active until a separate, grandfathering-safe quota release. Coordinated fake-account detection and appeals remain a launch gate.

### Booking and launch gate

A discovery-only closed beta may exercise M1/M2/M3/M6 under explicit testing labels. **Do not launch commercially** until M1, M2, M3, M4, and M6 have passed end-to-end acceptance, with refund/reversal tests, fraud checks, fee disclosure, escrow operations, live user confirmations and legal/compliance sign-off. Existing Vercel build success is not sufficient; fix unrelated CI failures that block launch.

### Admin Finance — incomes by activity, then totals

Break out every **recorded platform fee**, with source table, status, count and amount. Classify verified **Book service charges**, **Live support**, **Hire client salary tracking**, **Hire Talent salary tracking**, **business verification**, and **subscriptions** individually. Keep pending **Collab Seal**, **Hire Seal**, **Sponsor Seal**, and other fees visible as **unavailable/unknown**, not naively ₦0.

**Only platform fees belong in platform income.** A Sponsor's funds sent to Talent are NOT ChombuTar income, except a separately recorded platform service charge. The same applies to escrow principal, user wallet deposits and user-to-user transfers.

Report these separately:

- **Total recorded platform fee charges (partial):** sum of source-linked recorded fee charges/net reversals, including invoiced/charged service items with recognition policies still pending.
- **Earned revenue (partial):** currently audited Live support + net recorded Book service charges. Do not call deferred subscriptions, refundable verification, or unearned tracking charges earned.
- **Charges pending revenue recognition:** billed charges needing deferral/refund/reconciliation policy.
- **Customer liabilities:** wallet balances, held escrow and pending payout obligations shown in a separate section, not summed into company income.
- **Net profit:** unknown until processor fees, tax, settlements, costs, refunds and cash reconciliation are complete.

Each stream must have a traceable transaction audit before it can move from *unavailable* to *recorded*. Admin may configure prices only through existing audited pricing controls; no fee changes or bonus payouts until product owner signs off on amounts and unit economics.

### Acceptance checklist

- [ ] Genuine discovery qualifies once per actor–Talent pair; duplicate events and spoofed timers do not increase Orbit.
- [ ] New Hat awards stop at the current cap, unlock as specified, and cannot reset daily.
- [ ] Each category shows sourced evidence; Talent/Client separate; one decimal displayed.
- [ ] For You and Keeping Up are distinct; empty following feed has a helpful fallback.
- [ ] Payment and completion events, refund reversals, and all user-facing fee quotes reconcile.
- [ ] Admin shows individual fee incomes **then** correctly summed, explicitly partial totals; missing ledgers show unknown rather than zero; no customer money is included.
- [ ] Commercial launch blocked until verified Book/escrow and other agreed milestones pass.
- [ ] Legal Seal terms, signatures, cancellation, dispute and payout handling are reviewed.


## KeepUp milestone release — migration and monitoring

1. Apply `associates-2026-10` if necessary, then `orbit-milestones-2026-11` from **Admin → Database Migrations**. This release does not create or adjust financial transactions.
2. One signed-in follower may claim an initial +1 / +3 credit per **eligible published Talent account**. Neither self-follows nor client-only profiles qualify. Account-pair database uniqueness and locked, atomic follow/unfollow operations prevent retry-based double claims.
3. Current follower state and score are separate: the event history remains after unfollow, +1 is offset by -1, and a subsequent refollow restores +1 **without** repeating +3. Blocking immediately removes follows and posts matching reversals in the same transaction.
4. No historical follows are automatically backfilled. Event source IDs, policy version, actor, subject and reversal references are retained. A separate migration and signed-off verification rules are required for historical migration.
5. **Open launch risks:** account farms and coordinated multi-account follows remain possible without an identity/behavior abuse review and appeal mechanism. The +3 figures are **stored entitlement evidence only** until server-side Hat quota enforcement and legacy-owner grandfathering are implemented. No money is paid for KeepUp.
