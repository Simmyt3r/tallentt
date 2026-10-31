# Cloudinary Live in ChombuTar

ChombuTar can now broadcast using Cloudinary's **Live Streaming API** (RTMP input, HLS output, archive in Cloudinary) without a VPS. **Cloudinary upload credentials alone are not sufficient**: the Cloudinary account must also have Live Streaming API access.

## Go live

1. Enable Live Streaming in your Cloudinary product environment. Verify that **Video → Live Streams** appears in Cloudinary Console and that `GET /v2/video/<cloud_name>/live_streams` is authorized.
2. In Vercel, set server-only `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (or `CLOUDINARY_URL`). Set `LIVE_VIDEO_PROVIDER=cloudinary`. **Never** prefix API secrets with `VITE_`.
3. In ChombuTar Admin → Database Migrations, apply the base `db/live-support.sql` migration if it has not been applied already, then apply **cloudinary-live-2026-10**. Apply Stage competitions migration separately if needed.
4. Deploy the new application code, open ChombuTar Live and check the readiness indicator. It checks Cloudinary's actual API and blocks room creation if access is denied.
5. Talent/dual subscriber selects **Live broadcast → Create RTMP Live room**. Open the created room, select **View my RTMP broadcast settings**. Copy the server URL and **private stream key**.
6. On a computer, use OBS Studio → Settings → Stream → Service: Custom. Paste Server and Stream Key. Add camera/microphone and press **Start Streaming**. On a phone, use a broadcaster that supports custom RTMP/RTMPS URLs and keys. **The web app itself cannot transmit camera video directly to Cloudinary**: Cloudinary accepts RTMP input, not WHIP or WebRTC.
7. ChombuTar checks Cloudinary's actual stream status (up to 15s between status checks). Once active, the room is marked LIVE and participants can watch HLS, like, support, and participate in Stage competitions. New Cloudinary live streams may take around one minute to begin playing.
8. End broadcast by stopping the RTMP encoder and pressing **End Live**. ChombuTar calls Cloudinary idle before marking the room ended.
9. Test from a **different account/device** using the real production site; check video **and audio**, gift support, Stage competitions, and end-state behavior. Do not use a local camera preview as proof of public playback.

## Provider choice
- `LIVE_VIDEO_PROVIDER=cloudinary`: RTMP encoder -> Cloudinary HLS. No VPS required. Requires a Cloudinary plan/account with Live Streaming access.
- `LIVE_VIDEO_PROVIDER=mediamtx`: browser WebRTC camera -> reachable MediaMTX/WHIP media relay -> HLS. Requires relay hosting, TLS and WebRTC network support.
- `LIVE_VIDEO_PROVIDER=auto`: prefer a verified healthy MediaMTX relay, otherwise use Cloudinary RTMP if its API is enabled.

## Safety, cost and limits
Cloudinary stream keys are returned only to the authenticated owner, when explicitly requested. They are never stored in the Postgres database, placed in livestream URLs, or exposed through public stream list APIs. Regenerate/revoke leaked stream keys in Cloudinary. Disabling or rotating a stream key may require creating a new Cloudinary Live stream. The Cloudinary API secret remains on the server.

Cloudinary Live Streaming, transcoding, recording, storage and HLS bandwidth can incur usage charges. Set budget alerts/limits with Cloudinary before public launch. Cloudinary's configured maximum runtime limits each broadcast; do not rely on the frontend to extend a stream indefinitely.

This feature does not make the website's phone-camera preview into a real public stream. For one-tap in-browser camera Live, keep/deploy a working MediaMTX relay or equivalent managed WebRTC-to-RTMP service.

See [Cloudinary Live streaming](https://cloudinary.com/documentation/video_live_streaming) and [Live Streaming API](https://cloudinary.com/documentation/video_live_streaming_reference).
