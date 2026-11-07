# Step 2 — Landing and Guest Showroom Release (2026-11-07)

Source specification: Chombotar-Landing-Guest-Showroom-Design-v2.pdf (four pages), supplied by product owner.

## Experience delivered

- One landing-page stage transitions right-to-left through Showroom, Bento and Hits & Vibes, with pause/play, directional controls, dots, synchronized previews and captions.
- Guest may visit Showroom, Bento, Hits & Vibes, Talent profile, published gallery, public Hat media and Work Pass without an account.
- Guest search filters public talent work, with optional manual city/LGA filter. The stage describes **Across Nigeria** until location can be determined legitimately: **Abuja** in the source document is illustrative, not an inferred viewer location.
- Public cards show current calculated Orbit if available. Discovery and KeepUp show counts only when their corresponding verified database records are installed. Missing data is shown as an em dash, never falsely as zero.
- Guest Like, KeepUp, Book, Save, Share, Comment, Message, Hire, Collab, Sponsor trigger Sign Up / Log In / Keep Looking gate, not a mutation.
- Account creation and login accept only validated local destination tokens. Post-login KeepUp is verified via the existing Associates/KeepUp service and performed at most once; other actions return to Talent context and await the user's explicit next action.
- Work Pass preview does **not** contain a Book button; Book remains a Talent/individual Hat profile action.
- Sensitive account routes (wallet, inbox, admin, private Work Pass, payments and writes) continue requiring authenticated sessions.

## API and privacy controls

Public endpoint: `GET /api/showroom?action=guest_discovery&mode=showroom|bento|vibes`.

- Uses approved, published media only; excludes held, rejected, non-public, deleted and restricted content.
- Response explicitly projects allowlisted fields; excludes personal contact information, NIN, passwords, bank/wallet fields, internal moderation evidence and private deal data.
- Bounded 12-item public pages, 30 pages maximum, no anonymous write endpoints.
- Guest reads never call `recordView`, `discoveryAction`, `toggleLike`, `associate_follow` or commercial APIs.
- Signed-in verified Discovery belongs to Step 3 of 5. **Guest views = zero earned Orbit and zero verified Discovery.**
- Production should rate-limit and monitor public reads; large concurrent traffic and ad-hoc `accountOrbit` calculation can be expensive.

## Acceptance / deployment checklist

1. **Guest in private browser**: Landing → Enter Showroom → explore, search → profile/gallery/Work Pass; no forced registration.
2. Showroom, Bento and Vibes show media and counts without fake names/Orbit; media held by moderation never appears to guests.
3. Selecting KeepUp displays three options; selecting Keep Looking changes no state.
4. Sign Up returns to the chosen Talent and results in exactly one `subscriber_follows` relationship and an authorized KeepUp transition. Existing followers are not credited again. Login should behave identically.
5. Check Safari/Android Chrome/desktop viewport, keyboard control, reduced motion and fallback empty states.
6. Ensure `associates-2026-10` is applied on the target DB before enabling the promised auto-KeepUp. If not installed, the return screen shows an explicit retryable error rather than a false success.
7. Verify the latest Vercel deployment SHA, environment variables, production database migration status and anonymous GET responses independently from GitHub Actions.
8. Do not apply production database migrations or touch funds as part of the public guest release.
9. Owner should confirm whether brand spelling is **Chombotar** (design headline) or **ChombuTar** (existing platform logo/code). This release preserves both only where called for by source.

## Outstanding work (next releases)

- **Step 3**: Explorer +1, qualified signed-in Discovery proof actions, Showcase +0.1 cap per unlock cycle, verified commercial milestones, fraud detection and Orbit reconciliation.
- **Step 4**: full commerce/finance reconciliation, real-device QR payment and disputes, subscription administration.
- **Step 5**: monitored closed-beta sign-off, legal compliance, user acceptance and launch preflight.

No real payment happens in the guest return flow.
