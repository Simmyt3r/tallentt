# ChombuTar Live — LiveKit Cloud (no VPS, no OBS)

ChombuTar's LiveKit integration allows Talent and dual-role accounts to stream their own phone or laptop camera/microphone directly inside ChombuTar. Viewers watch with subscribe-only credentials. The **website stays on Vercel**; LiveKit Cloud carries live video and audio. Cloudinary still handles uploaded media, but **the old RTMP stream key is not used**.

## 1. Set up LiveKit Cloud

1. Create a project at https://cloud.livekit.io/ using LiveKit's free Build tier (subject to the provider's current usage limits).
2. In project settings, copy its **Project URL** (starts with `wss://`), **API key**, and **API secret**.
3. If an API secret was shared in a chat, screenshot or public file, **rotate the key/secret in LiveKit** and use the new values. Never commit them to the repository.
4. Go to **Vercel → your ChombuTar project → Settings → Environment Variables**. Configure **Production** (and Preview if testing there):

   ```env
   LIVE_VIDEO_PROVIDER=livekit
   LIVEKIT_URL=wss://YOUR-PROJECT.livekit.cloud
   LIVEKIT_API_KEY=YOUR_NEW_API_KEY
   LIVEKIT_API_SECRET=YOUR_NEW_API_SECRET
   ```

   **Replace** an existing `LIVE_VIDEO_PROVIDER=cloudinary` or `mediamtx`. Do **not** use `VITE_` for secrets. Redeploy the latest `main` version.

5. Confirm the application's Live readiness: sign in to ChombuTar, open `/live`. The authenticated endpoint `GET /api/live?media_status=1` should return `{"broadcast_ready":true,"mode":"livekit",...}`. If it reports `livekit_unconfigured`, the environment values aren't present/valid for that deployment. If `livekit_unavailable`, confirm the credentials and Cloud status. The app checks the provider API, not just whether env vars are present.

## 2. Test from two separate devices

1. On an HTTPS phone browser, sign in as a Talent or dual-role subscriber. Select **Go Live from camera**. Allow the camera and microphone when prompted.
2. In the preview, enter a title, choose a category and press **Start Live**. The app publishes the existing camera/mic tracks to LiveKit Cloud; it doesn't use OBS or RTMP.
3. On another phone or computer, sign in with a different subscriber account, open Live and join the broadcast. Confirm moving video and audible sound. Some browsers require viewers to press **Tap to enable sound**.
4. On the host, test **microphone** and **camera** toggles. End Live from the host and confirm viewers are disconnected and the room stops being available.
5. Try mobile data, Wi-Fi, rejected camera permissions and a temporary network outage. Check the provider's usage dashboard for free-tier capacity.

## Security and behavior

- The ChombuTar API signs 30-minute participant join tokens using the private LiveKit API secret. The expiration limits joining/rejoining; it does not impose a 30-minute broadcast limit.
- Only the stream owner can receive a publish-enabled token. Every other authenticated subscriber receives **subscribe-only** rights. Client-supplied room names, identities and publish permissions are ignored.
- Creating a ChombuTar Live room creates a corresponding managed LiveKit room; the server only marks it LIVE after verifying the host has actually published a track. End Live requests delete the remote LiveKit room before finalizing the ChombuTar database status.
- Existing Stage competitions, wallet-based support and interactions still use ChombuTar's backend. Advanced Stage multi-presenter media would need additional permission/work before using LiveKit for contestants.
- A user may have only one active LiveKit broadcast at a time. Beta rooms are capped at 100 participants each and limited by LiveKit's current free quota. Expect possible capacity constraints; monitor usage.
- Secrets remain server-side and are never present in a browser bundle or GitHub. The LiveKit room URL is public infrastructure configuration, but the API secret is private.
- After page reload a phone's original capture is stopped. If the room becomes unreachable, viewers may temporarily see reconnecting; the server checks provider status and eventually retires stale rooms.

## If the cloud readiness check fails

- Check the exact Vercel project and **Production** environment target, then redeploy.
- Check that the `LIVEKIT_URL` is `wss://...` without path and the credentials are the new, rotated values.
- Check that your LiveKit Cloud project is not suspended or over quota.
- If you still see instructions to use OBS, the deployment's `LIVE_VIDEO_PROVIDER` is still set to `cloudinary`.
- If the viewer cannot hear sound, tap the sound button. Browser autoplay policy can block audio until a gesture.
- If a viewer's room shows "Talent is preparing the Live" for too long, check the host camera permission and LiveKit browser logs; only an actually published host track marks the room live.

LiveKit references: https://docs.livekit.io/frontends/reference/tokens-grants/ and https://docs.livekit.io/reference/other/roomservice-api/.
