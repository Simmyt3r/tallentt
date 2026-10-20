# ChombuTar — Associates & unified Inbox (stage 1)

Derived from the uploaded **Chombotar – Associates & Chat Design**, which explicitly distinguishes mutual Associates from one-way Subscribers, and financial Bento Chat from professional networking.

## User-facing flows

1. Header chat icon opens a short contextual chooser with a preview of recent conversations.
2. **Inbox** on the five-item bottom navigation opens `/inbox`. Tabs are **Bento Chat** and **Associates Chat**, with lane-specific search controls. The underlying data is NOT merged.
3. Showroom or Profile defaults to Associates; BentoField or My Deals defaults to Bento.
4. Legacy `/messages?escrow=<id>` and `/chats?thread=<id>` deep links redirect into their original lane without losing the identifier.
5. **Profile → Associates** shows mutual connections, subscriber count, requested associations and voluntary vouches. New requests require recipient acceptance; one-way subscribers do not.
6. **Settings → Privacy** controls invites: Everyone / Verified talents only / No one. Verified talents here means an active manually verified Hat, not an assertion of government identity.
7. Vouches are permitted only between accepted Associates, can be withdrawn, and are counted on Showroom and Bento cards. Vouches are **not** completed jobs, employment history or Orbit verification.
8. Associate list Orbit values come from the existing account-activity scorer and load lazily.

## Security and accounting boundaries

- Bento Chat continues to use the original escrow-scoped booking messages. Escrow amounts, deliverables, disputes, QR milestones, Paystack and wallet mutations never move to Associates Chat.
- Associates Chat continues in `community_threads` and `community_messages`; new conversations require an accepted Associate relationship once the migration is available. Existing conversations remain readable. A blocked/removed Associate connection cannot continue sending using an old chat thread.
- Accepted Associate status and one-way subscriber follow are distinct rows. Requests require approval and have rate limiting.
- Users cannot vouch for themselves, cannot vouch without an accepted relationship, and can revoke earlier vouches. Blocking unlinks both users and removes mutual follows.
- Vouch counts are read only from accepted relationships. Co-hiring evidence and Orbit boosts are **not** fabricated from vouch totals.

## Rollout

1. Run API syntax checks, feature tests, PWA build and browser tests. Do not use green status from this feature branch as proof that unrelated platform tests are fixed.
2. Back up PostgreSQL. Confirm **General subscriber chats** is migrated.
3. Apply `associates-2026-10` using **Admin → Database Migrations** (allowlisted).
4. Verify Alice/Bob request → accept → chat → vouch → remove/block. Confirm unauthorized users cannot read messages, create vouches, or bypass invitation privacy.
5. Verify Alice subscribes to Bob without creating an Associate relationship, then unsubscribes.
6. Verify the five bottom navigation destinations on 320/390 px mobile and desktop. Test returning from deep links without switching lanes.
7. Confirm counters and Showroom vouch badge refresh after an actual accepted vouch.
8. Complete Live and finance release gates separately. This feature does not operate the Live media server.

## Deferred from source design

- Exact five **Profile content tabs** (Hits / Vibes / Bento Field / Associates / Reviews): existing Portfolio and Hats tabs are preserved rather than relabeled inaccurately.
- Verifiable **co-billing** and **hired together** counts require their own auditable work records.
- Orbit cannot safely gain points from an unverified vouch alone. A capped, paid-work-backed collaboration factor requires an explicit scoring rule and fraud tests.
- Additional sound and financial priority badges require accurate per-lane unread signals; no fake unread counts or forced notification sounds.
- A pinned Bento Chat job card with separate Pay, Deliver, Review and Dispute **actions** must reuse verified existing checkout/lifecycle routes after dedicated acceptance tests. The existing deal detail remains available.

This implementation intentionally builds the core relationship and unified Inbox foundations first; those deferred items are NOT shipped.
