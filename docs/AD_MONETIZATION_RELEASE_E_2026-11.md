# ChombuTar Advertising — Release E: Showroom Video Preview

**Status:** Production billing and paid video delivery remain disabled.
**Scope:** Skippable, muted sponsored videos in regular Showroom Talent posts only.

## Implemented
- Video creatives are looked up through the existing `api/hats` endpoint using `ad_video_slots=<hat_id>`; this does not introduce another Vercel function or any mutation route.
- Server eligibility requires an approved advertiser and moderated video creative, an active 30-day-bound campaign and placement, explicit Talent placement consent, active public Talent Hat, approved and accepted commercial terms and funding receipt evidence. Cloudinary video URLs must belong to the configured Cloudinary cloud and use HTTPS video/upload paths. These records remain **internally asserted evidence**, not independently reconciled payment-provider cash.
- Video delivery is **preview-only**. It requires ALL three server-side checks: `CHOMBUTAR_AD_DELIVERY_ENABLED=true`, `CHOMBUTAR_AD_VIDEO_DELIVERY_ENABLED=true`, and `VERCEL_ENV=preview`. Absent any one, the API returns no video.
- Showroom posts display an accessible, labelled Sponsored video over the media stage, rather than replacing the original Talent video. Normal post content resumes after the ad exits.
- Muted autoplay attempt with browser-compatible fallback; never auto-unmute. Explicit Play/Pause and Mute/Unmute buttons.
- Skip after **five seconds of video playback**, never more than **15 seconds**; ends early on media completion and offers immediate continuation on media failure.
- At most **two video previews per tab session**; at least **four unique viewed Talent posts** before an ad and four between ads, enforced in the UI. This frequency policy is **nonbillable** and can be bypassed or reset by the user; it is never invoice or payout evidence.
- Swipe, tab invisibility, viewing details and changing feed view close an active ad. Talent media is paused while the ad runs and restored afterwards. Top 12 rankings show neither sponsor banners nor video. No video ads are placed in Hits & Vibes.

## Test and privacy safeguards
- No impression/interaction analytics are stored by this implementation.
- No Orbit/Explorer points, commission fees, wallet credits, ad settlement, deposits or provider payments are recorded.
- No advertiser click-through destination is introduced yet, because destination URL review/redirect protection is unresolved.
- A trusted Cloudinary URL alone does not certify the advertiser has rights to the content; approvals and media-rights confirmation remain launch requirements.
- Test coverage verifies 4-post cadence, Top 12/search exclusions, two-per-session cap, Cloudinary URL restrictions, preview-only flags, approved creatives, verified-record funding and detachment exclusions.
- Video duration is constrained at playback time, not by upload validation. A 15-second maximum creative duration and a signed upload/moderation path must be enforced before any production video product is sold.

## Outstanding launch blockers
1. Approved performance metric, pricing and advertiser contract.
2. Independently reconciled bank/provider funding and delivery/invalid-traffic controls.
3. Server-authoritative session frequency caps, rate limiting and audited ad rotation/pacing.
4. Media ownership, rights, signed uploads and explicit moderation confirmation.
5. Campaign/placement assignment and advertiser destination URL policy.
6. Final refund, early detach, dispute and reward-allocation rules.
7. Real integration tests on staging and pilot advertiser consent before enabling any live delivery.

This is a nonbillable UI and eligibility foundation only. **Do not set the preview video flag in production or treat it as an instruction to activate paid adverts.**
