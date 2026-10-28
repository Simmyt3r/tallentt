# Closed Beta Launch — Preconditions and Operations

**Target:** invited Nigerian beta group before 31 December 2026, **only if pass conditions are met**. Public commercial date remains TBD.

## Phase 0 — Incorporation and decision rights
- Confirm CAC entity and authorized signatories, beneficial ownership filings and company accounts.
- Approve tripartite term sheet, IP schedule, technical SLA and staged finance/disbursement policy.
- Approve six-month ₦5m *discussion target* and identify the actual capital contributor(s); zero funds are currently pledged.
- Define who can deploy, move funds, change contracts or disable media.

## Phase 1 — Legal and user experience
- Replace in-app one-paragraph terms/privacy/vendor/cookie dialogs with approved complete, versioned documents.
- Correct signup consent, immutable acceptance logs, data rights, age safeguards and customer-facing booking terms.
- Truthful Work Pass claims, media rights and social sharing badges; review marketing/ambassador endorsements.
- Confirm legally permitted wallet, escrow, payout and direct-payment arrangements with payment service providers.

## Phase 2 — Product and security QA
- Production-like test accounts and controlled fake payments; test both talent and client journeys end-to-end.
- Validate start-payment 30%, finish-payment 70%, duplicate/replayed QR, partial refunds, disputes, chargebacks, withdrawal failures, idempotency, account deletion blockers and ledger reconciliation.
- Validate actual MediaMTX/TURN/HTTPS stack, live broadcast and remote playback on separate mobile networks; verify AV moderation and reports.
- Verify signed uploads, Work Pass cryptographic key management and verification under rotation/revocation.
- Run automated checks plus independent browser/device tests, database migrations, permission controls, rate limits and backup/restore.

## Android Play Store release gates
- Open a **company-owned organization** Play Console only after CAC registration and D-U-N-S/identity verification; fee US$25 once. Preserve company ownership of developer profile, app package and release-signing credentials.
- Produce a compliant Android App Bundle (.aab) from the existing PWA, including camera, microphone, notifications, external link and in-app browser testing. For new Android phone apps, target API level 36 under 2026 policy.
- Complete Data safety, privacy policy, content rating, support information, account deletion **inside the app and through a web page**, plus appropriate permissions and moderation declarations.
- Use Play internal/closed testing with ambassador cohort. New personal developer accounts require 12 testers opted in for 14 continuous days before applying for production; this specific rule should **not** be asserted as automatically applying to organization accounts.
- Classify each payable item: physical service job, digital feature, premium placement, credits, in-app subscription, cloud storage; Google Play Billing rules differ. No production paid Android sale until reviewed.
- If required identity validation or testing cannot finish in time, web/PWA beta may proceed only if its independent release gates pass; public Play release waits.

## Phase 3 — Lean operating controls
- 501–2,000 active user target is a **ceiling for planning**, not guaranteed acquisition.
- Hard budget per service, quota per file/user, max bitrate and max concurrent Live rooms/viewers, active cost telemetry and shutdown/escalation threshold.
- Signed and compensated ambassador agreements, test-run forms, privacy consent and feedback collection.
- Weekly operations report: cost, incidents, uploaded GB, delivered video GB, conversion, completed jobs, fraud cases and balance reconciliation.

## Stop/go criteria
STOP if: no signed rights to operate/IP; no binding customer terms; production payment integrity unverified; Live cannot pass remote viewer tests; unresolved high-severity security issue; regulatory payment opinion adverse; no sufficient operating capital; or no moderation/dispute response coverage.

GO limited beta only upon written release approval by the operating company's authorized directors/representatives, with recorded open risks and a rollback plan. Do not treat a passing CI check as permission to take real-money deposits.

## Beta forms
1. Ambassador/tester registration: name, contact, experience/skills, consent, device/network, preferred role, conflict of interest.
2. Trial observation: task, expected outcome, actual outcome, time, screenshots with consent, severity and follow-up.
3. Incident form: timestamp, affected accounts/assets, exposure, provider references, containment, escalations and final resolution.
4. Release sign-off: Legal, Finance, Security, Tech, Trust & Support; each named approver, dated acceptance and linked evidence.

**Repo evidence:** docs/PRODUCTION_LOOSE_ENDS_AUDIT_2026-10.md ; docs/OCT_19_RELEASE_GATES.md ; docs/LIVE_DEPLOYMENT.md.
