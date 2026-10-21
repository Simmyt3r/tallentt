# ChombuTar: nine-point remediation (21 October 2026)

## Confirmed changes

1. Hits & Vibes: ^username remains enabled; a compact one-row composer replaces the taller text box. Approved media publishes automatically after safety screening; held, suspicious and reported cases go to review.
2. Showroom caption: Showroom → + → choose standalone media or a Hat → choose photo/video → Add a caption → Post. The caption appears below the media alongside the author identity. It is separate from the Hat tagline.
3. Live: media checks now reject HTTP errors and HTML login pages instead of falsely displaying broadcast-ready. External persistent MediaMTX infrastructure, TLS/WHIP/HLS, public ICE/TURN and two-device verification remain necessary. Code changes alone do not provision a relay.
4. Search: shared DiscoverySearch keeps the Showroom-style field without browser-native clear X, retains Escape-to-clear.
5. Navigation: removed forced browser Back interception that jumped users to Showroom between tabs. Real modal close buttons remain where appropriate.
6. Finances: Admin Finance already separates escrow, wallets, pending payouts and partial recognized platform fees. New paginated, read-only liability drilldowns provide source references. Platform owners' net profit is not calculated without verified commissions, costs, taxes, refunds and settlement reconciliation. There are no transfers or balance changes in these audit methods.
7. General chat: top navigation already opens /chats rather than deal-only /messages. A separate unified Inbox is on an unmerged feature branch, not part of this patch.
8. BentoCard shows activity-based account Orbit score with the useAccountOrbit hook.
9. Notifications: a visible search button next to the title focuses the server-side searchable field, including on mobile.

## Required deployment checks

- Run targeted tests, API syntax checks, PWA build and broader repository CI.
- Verify at 320px and 390px: search button, captions, Back history, sidebar, global chat and Bento Orbit.
- Compare liability drilldown row values with aggregated numbers and source references. Do not add different liability classes into purported profit.
- Check Vercel production configuration for LIVE_MEDIA_SERVER_URL (HTTP 2xx non-HTML health response), LIVE_WHIP_URL, LIVE_HLS_BASE_URL and secure ICE/TURN. Deploy a persistent MediaMTX relay outside Vercel.
- Sign in from one Talent phone and another independent viewer device to confirm actual video and sound over HLS, plus reconnect and auth rejection.
- The Vercel account currently accessible here does not expose the ChombuTar project owned by a different team. These source changes do not configure that inaccessible deployment.

No database migrations or credential changes are included in this patch.