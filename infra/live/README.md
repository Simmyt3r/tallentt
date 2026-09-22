# ChombuTar Live self-hosted services

This directory deploys MediaMTX for media and a tiny WebSocket relay for interaction events. Vercel remains the application/API host.

## Required deployment values

- `LIVE_APP_ORIGIN`: deployed ChombuTar origin.
- `LIVE_MEDIA_AUTH_URL`: Vercel endpoint, normally `https://<app>/api/live?media_auth=1`.
- `LIVE_WEBRTC_ADDITIONAL_HOSTS`: public MediaMTX hostname/IP announced to WebRTC peers.
- `LIVE_REALTIME_SECRET`: shared secret also configured in Vercel.
- Optional port overrides: `LIVE_HLS_PORT`, `LIVE_WHIP_PORT`, `LIVE_ICE_UDP_PORT`, `LIVE_REALTIME_PORT`.

Run with `docker compose up -d --build`.

Production deployments should terminate TLS in front of the WHIP, HLS and WebSocket HTTP endpoints and expose UDP 8189 for WebRTC ICE. Configure the matching public HTTPS/WSS URLs in the main application's environment variables. No media bytes pass through the WebSocket relay or Vercel.
