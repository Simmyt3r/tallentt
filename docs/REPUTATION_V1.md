# Lifetime reputation and work reviews

Apply the employment migration first, then `db/patch-reputation-2026-10.sql` (or `node db/migrate.js --reputation`). Deployment can precede migration: summaries remain absent and review mutations unavailable until installed.

This version starts with future database events, without backfilling historical points. Funding earns talent +20 and employer +30; refunds insert equal reversing events. Confirmed salary earns talent +30; receipt on/before the due date earns employer +70. A five-star review of completed, released work earns talent +40. Each award has a unique source key and rule version, preventing repeat processing from duplicating points. Moderating a review hides its public text/rating and appends a reversing event for its reward. Existing activity and Live scores remain independent. Level is floor(sqrt(max(points,0)/100)); negative balances are retained in the ledger.

Per-talent attribution captures the Hat category at funding/review time, or the accepted employment talent. Public reviews require a real completed escrow and a participant, one per reviewer/job. Review text is public by explicit submission. Employer reliability shows on-time versus confirmed salary periods only where the talent elected to publish employment records. It excludes unconfirmed periods and never publishes amounts.

Delivery-time rewards, media rewards, ghosting penalties, dispute-loss deductions, release-speed metrics and historical backfills require additional eligibility rules/evidence. They are not inferred from open disputes or arbitrary timestamps. Paid plan colors do not affect reputation. Review moderation is available to authenticated administrators through `review_hide` with a mandatory reason and audit log.

Validation: `node --test tests/reputation.test.mjs tests/employment.test.mjs`; production build and serverless syntax check. The mobile review-submission browser check passed with no page errors or horizontal overflow. Fourteen database/lifecycle checks, the serverless syntax check, and the production build passed.
