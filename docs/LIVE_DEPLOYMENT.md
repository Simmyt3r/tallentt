# ChombuTar Live transport deployment (production)

This is a **separate real-time media server**. Vercel handles authentication,
metadata, deals and user interface, **not** the long-lived video relay. A
serverless camera preview must never be labelled a public broadcast.

## Supported architecture

Camera/microphone → browser WHIP/WebRTC → public HTTPS MediaMTX ingest
→ low-latency HLS → viewers. The server must have stable WebRTC/ICE routing,
a domain and TLS termination. Where UDP is blocked, provide public TURN.

1. Deploy the official MediaMTX Docker image to a persistent container/VPS.
   Follow [current official documentation](https://mediamtx.org/docs/features/configuration)
   for the version you deploy. Do not run it on Vercel Functions.
2. In MediaMTX, enable WebRTC (normally 8889), HLS (normally 8888),
   low-latency HLS, and configure `webrtcAllowOrigins` and
   `hlsAllowOrigins` for the real ChombuTar HTTPS domain. Use a
   TLS-terminating reverse proxy and configure WebRTC public ICE/TURN.
3. Set MediaMTX external HTTP authorization to ChombuTar's
   `https://<app-origin>/api/live?media_auth=1`. The endpoint verifies
   each one-time WHIP publish token and **also** permits HLS reading for
   an active room. Do not configure MediaMTX `authHTTPExclude` for `read`
   or `playback`, because doing so bypasses the room's active-state gate.
   Publishing with an invalid token is always denied.
4. Configure Vercel *production environment variables*, preserving secrets:
   - `LIVE_MEDIA_SERVER_URL=https://<public-health-endpoint>`
     (reachable from Vercel; must return HTTP 2xx and non-HTML content.
     MediaMTX root returning 404 is NOT a valid health-check endpoint.)
   - `LIVE_WHIP_URL=https://<public-whip-origin>`
   - `LIVE_HLS_BASE_URL=https://<public-hls-origin>`
   - `VITE_LIVE_ICE_SERVERS_JSON` in the frontend as needed for approved
     STUN/TURN servers; place TURN **credentials** in protected settings and
     avoid long-lived client-embedded secrets.
5. The app constructs `<WHIP base>/live-<uuid>/whip` and
   `<HLS base>/live-<uuid>/index.m3u8`. Your reverse proxy must
   preserve these paths, bearer publish authorization and CORS.
6. Redeploy; check `GET /api/live?media_status=1` using a signed-in
   session. `broadcast_ready:true` confirms initial reachability,
   **not** complete video delivery.
7. Validate with **two different devices/accounts**:
   the Talent sees a live camera; a second viewer receives visible video
   and audible sound over HLS. Test mobile data, Wi-Fi, reconnect,
   mixed-content errors, CORS, HLS playlist access, JWT publish rejection,
   and ending the stream. Confirm public HLS access is only for active rooms.

## Operations & failure behavior

- A missing/unreachable media service now produces a clear unavailable
  message, instead of a false "LIVE" room with a local-only preview.
- Broadcast **publishing** is protected by session-issued single-use
  token hashes in the database. HLS playback checks real active room state.
- Video quality, transcoding, codec compatibility, CDN bandwidth and
  scaling require a transport deployment and real load tests.
- The connected Vercel account may not have access to the `talent-world`
  project; repository commits **do not** configure that external team.
- Do not embed MediaMTX administrative endpoints or credentials in the
  client, and do not substitute the Vercel dev proxy for the public relay.
