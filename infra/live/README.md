# ChombuTar Live — broadcast from a phone/browser (no OBS)

## Default: existing platform hosting and database

`LIVE_VIDEO_PROVIDER=platform` is the default. No additional provider, account, API key, VPS, media relay, WebSocket service or encoder is required. Camera and microphone are captured as independent two-second WebM/MP4 clips, authenticated uploads pass through the existing API, and signed-in viewers preload clips from a rolling database buffer. Video and sound reach a separate viewer; this is not a private preview. The first accepted video upload marks the room LIVE.

Keep the host tab open. Browsers may suspend capture in the background or when a phone locks. Slow connections can add several seconds of delay or brief pauses between clips. This mode uses existing API/database storage and bandwidth, so it is for modest audiences, not unlimited low-latency streaming. Camera capture and video formats depend on browser support. Each upload is capped at 768 KiB, only the owner may upload, eight clips are retained per room, and clips expire after 45 seconds. Ending Live removes its buffer immediately. Active requests clean expired clips and abandoned rooms; this is not a recording archive. The playback controls start muted and offer Enable sound.

Run `node --test tests/platform-live.test.mjs` and, after `npm run build`, `node tests/platform-live-ui.mjs`. The latter sends real fake-device camera/audio recordings between separate non-admin browser contexts, checks actual video decoding across successive clips, and verifies End Live and permissions. Also verify Safari/iPhone and real mobile networks before a broad launch.

## Optional external transports

The remaining instructions describe the optional MediaMTX deployment. They are not prerequisites for the default platform transport. A configured external provider can be selected explicitly; unavailable providers fall back to the platform transport.


**Goal:** Talent opens ChombuTar Live, allows camera and microphone access, previews the camera, and taps **Go Live**. A separate subscriber watches and hears the video in ChombuTar. No stream key and no encoder app.

The existing application already implements WebRTC/WHIP publishing, signed-in Live room creation, viewer HLS playback, stop controls and room interactions. The optional WHIP/HLS transport needs a **persistent public media server**. The default platform transport above runs through the existing app/API and database.

## Media flow

Phone or desktop browser (HTTPS) → WebRTC/WHIP → MediaMTX on a VPS (UDP + HTTPS) → MediaMTX HLS → viewers.

Cloudinary remains useful for uploaded photos and videos. Its Live Streaming service accepts RTMP input and cannot directly receive a phone browser's WebRTC stream. This browser-only route **does not stream through Cloudinary Live or use its RTMP key**. An optional managed WebRTC-to-RTMP bridge would be separate infrastructure.

## Deployment (Linux VPS with public UDP)

1. Buy or provision a persistent Linux VPS with a public IPv4 address and incoming **TCP 80, 443** and **UDP 8189**. Create a DNS A record such as `live.your-domain.com` pointing to that VPS. Use a host that permits inbound UDP; many serverless/PaaS environments do not.
2. Install Docker Engine and Compose. Copy/clone the ChombuTar repository onto that VPS and open `infra/live`.
3. Copy `.env.example` to `.env` in **this directory**. Set `LIVE_MEDIA_HOST`, `LIVE_APP_ORIGIN`, `LIVE_MEDIA_AUTH_URL`, `LIVE_WEBRTC_ADDITIONAL_HOSTS`, and a unique `LIVE_REALTIME_SECRET`. Use the real Vercel production domain for `LIVE_APP_ORIGIN` and `LIVE_MEDIA_AUTH_URL`. Keep these values and any secrets out of Git.
4. Start both the existing MediaMTX container and the provided TLS gateway:

   ```sh
   cd infra/live
   docker compose -f docker-compose.yml -f docker-compose.browser.yml up -d --build
   ```

   Caddy obtains/renews HTTPS certificates for the domain. The WHIP and HLS HTTP backends stay bound to localhost. The public **UDP 8189** port must reach the MediaMTX container for ICE.
5. From another network, visit `https://live.your-domain.com/health` (must return HTTP 200 JSON). This tests TLS gateway reachability **only**, not that a broadcast actually works.
6. In **Vercel → ChombuTar Project → Settings → Environment Variables** (Production), configure and redeploy:

   ```env
   LIVE_VIDEO_PROVIDER=mediamtx
   LIVE_MEDIA_SERVER_URL=https://live.your-domain.com/health
   LIVE_WHIP_URL=https://live.your-domain.com
   LIVE_HLS_BASE_URL=https://live.your-domain.com
   ```

   If using the optional interactions relay, configure `LIVE_REALTIME_PUBLISH_URL`, `LIVE_REALTIME_SECRET`, and `VITE_LIVE_WS_URL` separately with HTTPS/WSS; video works without that relay because room status falls back to polling.

7. Sign into ChombuTar and open **Live**. The readiness response `GET /api/live?media_status=1` should return `broadcast_ready:true`, `mode:"mediamtx"`. The response requires the authenticated browser session. If it reports `cloudinary`, the **Vercel** provider setting is still wrong.
8. On the host device, select **Go Live → allow camera & mic → preview → Go Live**. On a **different device and account**, check that both video and sound play. Also test a phone on mobile data, stop/restart, restricted networks and no-browser-permission errors.

## Troubleshooting

- **HTTP 405 on WHIP**: the HTTPS proxy did not route `/live-<room UUID>/whip` to MediaMTX `8889` or its resource URL is misrouted.
- **WHIP HTTP 401/403**: the external MediaMTX HTTP authorization callback rejected the stream token; confirm `LIVE_MEDIA_AUTH_URL` and backend deployment. Never bypass publish authentication.
- **WHIP connects but cannot establish WebRTC**: check UDP 8189, the public hostname in ICE candidates, NAT/firewall and any required TURN infrastructure. Some mobile/corporate networks block UDP and require a TURN relay.
- **Video works in preview but no other viewer sees it**: local camera preview is **not proof of broadcasting**. Check MediaMTX HLS paths, CORS, media codecs, and server logs.
- **Readiness says healthy but publishing fails**: the `/health` route proves the HTTPS gateway works, not MediaMTX media ingress or the ICE connection. Always do a separate device playback test.
- **HTTPS or CORS errors**: check DNS/TLS, `LIVE_APP_ORIGIN`, `MTX_WEBRTCALLOWORIGINS`, and `MTX_HLSALLOWORIGINS`.
- **Cloudinary still asks for OBS**: set `LIVE_VIDEO_PROVIDER=mediamtx` in Vercel (and redeploy). Cloudinary RTMP mode cannot broadcast directly from a browser.

## Important security/operational notes

MediaMTX's HTTP callback at `/api/live?media_auth=1` validates browser publishing credentials and checks public HLS reads against active room state. Do **not** exempt `read` or `playback` from authentication. Never put Cloudinary API secrets, RTMP stream keys, Vercel secrets, or long-lived TURN credentials in frontend `VITE_*` variables.

This deployment requires a separately billed persistent VPS, bandwidth, TLS, monitoring, and potentially TURN. Use an H.264-compatible device/codec for broad playback and verify audio. Vercel/Cloudinary configuration alone cannot make a browser camera publish RTMP. Rotate any previously shared Cloudinary RTMP stream key before future use.

See [MediaMTX WebRTC docs](https://mediamtx.org/docs/publish/web-browsers), [MediaMTX authentication](https://mediamtx.org/docs/features/authentication), and [Cloudinary Live docs](https://cloudinary.com/documentation/video_live_streaming).
