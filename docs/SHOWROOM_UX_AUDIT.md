# Showroom & Admin UX audit (2026-10-11)

## Scope

Source-level inspection of the current feature branch, plus automated Chromium
checks at 390px mobile and 1280px desktop. Covers the Showroom feed, the
three-step Add to Showroom flow, Hat media uploader, Showroom exception reviews,
appeals, and Admin → Showroom Settings.

This is **not** a hands-on test of the deployed production environment. The
CI browser uses controlled API fixtures, not production credentials or media.

## Implemented findings

| Severity | Problem | Change |
| --- | --- | --- |
| High | The Add to Showroom modal kept `submitting=true` after a successful post; the next post could be disabled | Reset all submission state on successful completion, and check a second post in the browser test |
| High | Audio uploads were reported by Cloudinary as `video`, losing audio identity and making image/video moderation incorrect | Preserve `audio` as the Hat's display type while verifying Cloudinary's `video` resource type against the user's signed permit; route audio to human moderation |
| High | An administrator could see an empty review queue before the first API response | Distinct loading, populated, empty and error states, with status announcements |
| Medium | Eleven Admin section buttons required horizontal scrolling on mobile, with hidden destinations | A labeled native section selector below 1024px, retaining desktop sidebar navigation |
| Medium | Environment-variable names and setup prerequisites made the screening settings hard to follow | Friendly field names, numbered jump links, larger mobile input text, checks before enforcement, and warning before discarding credentials |
| Medium | Reviewers could not listen to audio inside moderation cards | Native audio player, explicit listening guidance and readable reason labels |
| Medium | Approve/reject/appeal actions were crowded on narrow viewports and some rejected by one click without confirmation | Mobile-stacked 44px actions, consistent confirmations, loading/action feedback |
| Medium | Add to Showroom lacked reliable focus trapping and Escape handling | Reused the existing accessible dialog component: scroll lock, focus containment, Escape dismissal and focus restoration |
| Low | Long Showroom feedback messages could overflow the mobile viewport | Constrain width, wrap and center feedback |

## Automated checks

- `tests/showroom-ux-ui.mjs` is included in `npm run test:ui`.
- Checks Admin section navigation at mobile and desktop widths; the new
  Showroom settings page; audio moderation playback; horizontal overflow;
  Escape dismissal; keyboard focus restoration; and two consecutive Showroom
  posts without a stuck submit control.
- Screenshots are saved under `test-results/showroom-*.png` and uploaded as
  part of the CI screenshot artifact.
- `tests/hat-signed-media.test.mjs` verifies that an audio track uses the
  Cloudinary `video` API resource but retains `audio` in ChombuTar metadata.

## Remaining UX follow-ups

1. Run a real-device session on at least one low-end Android phone with
   throttled mobile data. Confirm media upload progress, resume after failed
   connections, and keyboard/safe-area behaviour.
2. Give creators a persistent, explanatory status after posting:
   **Awaiting review → Published → Needs changes**. Pending media currently
   isn't universally discoverable until it passes moderation.
3. Add stronger empty-state onboarding and moderated content examples for
   Talent portfolios with no Hat media.
4. Review the remaining Admin screens (Finance, Users, Disputes, Audit),
   which were outside the focused Showroom iteration.
5. Measure real-user completion/drop-off and accessibility beyond source
   review and Chromium tests, including keyboard-only and screen readers.

## Release gate

The fixes are committed to PR #22, not activated in production. Keep the
database and Cloudinary signed upload preflight/rollout precautions described
in `docs/HAT_MEDIA_SIGNED_UPLOADS.md`.
