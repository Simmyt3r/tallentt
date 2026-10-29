# Talent Card upgrade

Profile owners can choose their main talent from active Talent Hat categories, advertise Gigs and/or Full-time availability, and select up to three featured images/videos. The public profile has All and per-talent filters. All shows selected works first, filling remaining places with recent work; a talent filter shows that talent's media and Hats. Main talent appears first. Share links use the existing `/profile/:username?talent=Makeup` route and survive reload/history navigation. Unknown talent names fall back to All.

Existing Hat IDs, pricing, bookings and portfolios remain intact. Categories provide the stable grouping, including several Hats in one category. The existing portfolio response remains bounded at 60 items, with selected featured works fetched before recent work; per-talent filtering operates within that returned collection. Availability is self-reported and does not claim verified employment. Verified employment and lifetime/per-talent reputation belong to later phases.

Salary expectations are NGN/month. Owners may store an optional complete range and a tier. Public visibility is private, tier only, or range. The public API explicitly excludes private amounts and excludes tier unless tier visibility is selected. The owner-only session response includes saved values for editing. These fields are expectations, never contractual salary terms. Frontend rendering also uses the public projection so an owner sees the same public display as visitors.

Apply `db/patch-talent-card-2026-10.sql` before deploying these changes using the allowlisted Admin migration or `node db/migrate.js --talent-card`. The repeatable patch adds a JSONB settings field without rewriting existing profiles. Fresh databases receive it through `schema.sql`. No production migration or deployment was performed during implementation.

Validation:

- `node --test tests/talent-card.test.mjs tests/account-orbit.test.mjs tests/admin-migration-bundle.test.mjs`
- `node scripts/check-api.mjs`
- `node node_modules/vite/bin/vite.js build`
- `node tests/talent-card-ui.mjs` after building (set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an installed browser if needed).

Database tests cover migration replay, authenticated persistence, cross-account featured-media rejection, unchanged values during unrelated edits and public salary privacy. Browser checks cover deep links, featured works, filtering, browser history, editing and mobile overflow. The existing Orbit regression fixture now marks released work as completed, as required by the existing database constraint.
