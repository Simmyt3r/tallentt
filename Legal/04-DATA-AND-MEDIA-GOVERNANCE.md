# Data, Media, Work Pass and Subscriber Usage — Policy Requirements

**Nature:** Product compliance specification, NOT a published privacy notice. Terms and data flows must be verified against deployed systems.

## Hybrid custody chosen by parties
- ChombuTar stores essential identity/work evidence, right-sized thumbnails, audit metadata, signatures/hashes and minimum necessary transaction records.
- Subscriber may keep original large media in external provider accounts **subject to explicit linking authorization and revocation**. Avoid promises of permanent availability when subscribers control originals.
- Media hashes are integrity references, **not proof of professional competence, completion or identity by themselves**.

## Required data map
Categories: names, contacts, location, ages/guardian handling, login sessions and devices; talent portfolio and Work Pass statuses; verification/endorsements; uploads, voice/video, chats, transactions, bank/payout references; analytics, abuse, appeals, audit logs. Specify controller/processor, purpose, legal basis, source, recipients, cross-border transfers, storage location, access roles, duration and deletion pathway for each class.

## Minimum safeguards
1. Transparent notices and lawful bases for each processing purpose; granular marketing and public-media permissions.
2. Separate permissions for publishing customer images, bystanders and shared job-site records; age-assurance and enhanced youth safety if minors permitted.
3. Retention schedule **by category**; financial records, active disputes and lawful holds handled separately. No perpetual default retention.
4. Rights request workflow: access, correction, portability/objection/erasure where applicable, authenticated requests, exceptions and audit trail.
5. Encrypted connections and at-rest protection where supported; scoped signed URLs; short-lived upload authorization; key rotation; least privilege, token expiry, provider DPA and tested recovery.
6. Privacy and risk assessment before broad streaming, identity verification, high-risk profiling, automated moderation or international transfers.
7. Abuse reporting, appeal, moderator access logs, threat-model reviews, incident triage and legally required regulatory/individual notifications.
8. Clear technical and monetary limits: per-file upload size, per-user monthly upload allowance, thumbnail size, streaming bitrate, max Live sessions/viewers and purge policy.

## Lean provisional capacity model
For 1,500 active users, 2 hours of viewer time per month and 1.5 Mbps playback, delivered media is approximately **2.025 TB/month**, excluding protocol overhead, origin duplication, recordings, transcoding and replays. This illustrative use could exceed the **₦160,000/month total infrastructure allocation**. Require runtime spending alarms and load testing, and reduce concurrency/bitrate rather than absorbing uncontrolled debt.

## User controls and UI wording
- Show file sizes before uploads, provide data saver mode, compression, Wi-Fi-only option, content-expiry warnings and monthly usage meter.
- Make paid storage tiers transparent (none agreed yet). Explain what is platform hosted versus linked from external storage.
- Distinguish signed historical evidence from a current endorsement and from identity verification; provide appeal and fraud reporting.
- Provide user content export and remove/share controls consistent with law and contractual obligations.
- Do not promise that all content remains available offline or is preserved forever.

## Policy documents to draft and link from signup
Full Privacy Notice; Cookie Notice; User-Generated Content Terms; Work Pass Evidence/Verification Policy; Retention and Erasure Policy; Data Processing Agreements; External Cloud Integration Disclosure; Incident Response Procedure; Cybersecurity Standard.

**Legal review:** NDPC https://ndpc.gov.ng/ . **Technical implementation:** repository /api, /src, /docs; features may be incomplete until release tests pass.
