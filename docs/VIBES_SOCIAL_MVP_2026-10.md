# Hits & Vibes: subscriber-community MVP

**Branch:** `feat/vibes-community-feed`. This change is stacked on PR #26 (`feat/showroom-bento-flyers-inbox-management`). Merge PR #26 after its migration, then merge the Vibes PR after the Vibes migration.

## What subscribers can do

- Enter **Vibes** beside Showroom and Bento (desktop sidebar and responsive bottom bar).
- Publish short posts (0–500 characters) with zero to four photos. A textless photo post is valid.
- Like/unlike a post, send public replies (1–300 characters), remove their own replies and posts, share the post link and view the author's public profile.
- Report a post for spam, harassment, unsafe content or another concern. Reports are stored separately for subsequent moderation and investigation.
- Browse a chronological feed with keyset pagination, and navigate directly to `/vibes?post=<id>` from a shared link or reply notification.

Vibes does **not** implement a second escrow chat, direct message inbox, arbitrary external media URLs, video uploads, followers or algorithmic boosts yet. Subscriber-to-subscriber conversations are public replies; the existing Deals Chat remains tied to bookings.

## Media policy and launch checklist

The community API **always signs media uploads** with a server-held Cloudinary secret. It checks authenticated uploader identity, declared MIME/size, permit expiry and Cloudinary's authoritative resource record before publication. If `GOOGLE_CLOUD_VISION_API_KEY` is absent, verified uploads publish automatically unless Cloudinary's own moderation flags them. Once Vision is configured, images are checked with SafeSearch and videos are sampled across five frames; flagged or unavailable results remain held for review. The no-key behavior is a temporary launch fallback, not a claim that media was safety-screened. Allowed: JPEG, PNG, WebP (up to 8 MB), and MP4/WebM/MOV videos (up to 20 MB), up to ten attachments per post.

Media is **disabled by default** until operators configure Cloudinary and intentionally enable the feature. Google Vision is optional during the initial rollout:
```
CLOUDINARY_CLOUD_NAME=<your-cloud>
CLOUDINARY_API_KEY=<your-key>
CLOUDINARY_API_SECRET=<your-secret>
GOOGLE_CLOUD_VISION_API_KEY=<your-key>
VIBES_MEDIA_UPLOADS=enabled
```
Never put server Cloudinary secrets in `VITE_*` variables. The Google Vision key is optional during initial rollout: without it, Cloudinary-verified uploads publish automatically unless Cloudinary's own moderation flags them. After the key is configured, Vision checks apply; flagged or unavailable analysis keeps media held for review. Text posting remains available. Reports have a database queue but the admin-review UI needs its own later QA/release. There is no automatic hard deletion upon reports, avoiding easy coordinated abuse.

## Required SQL migrations

The existing PR #26 migration runs **first**:

```bash
npm run db:migrate:bento-inbox
```

Then apply the additive Vibes migration before deploying Vibes code:

```bash
npm run db:migrate:vibes
```

SQL: `db/patch-vibes-2026-10.sql`. This creates `vibes_posts`, `vibes_likes`, `vibes_comments`, `vibes_reports`, and `vibes_upload_permits`. No changes to escrows, wallets, Hats, or existing media. Both patches are repeatable and use transactions. Back up production first.

## QA and operational limits

- Server: 10 posts/hour/account; 40 replies/hour/account; 20 photo upload permits/hour/account. Database enforces body and media limits.
- `npm test` includes `tests/vibes.test.mjs` for auth, likes, post/reply deletion authorization, report dedupe and untrusted upload rejection.
- Verify mobile 320px and desktop navigation, photo-only/text-only posts, double likes, reply notification, sharing, failed uploads and slow connectivity.
- For a production launch of public social content, complete a user-report moderation workflow, abuse review procedures, and a published community code of conduct before broader marketing. The API records reports but does not yet expose a complete moderation dashboard.

## Adoption metrics to watch

Activation rate (registered subscribers posting/replying), 7-day returning participants, replies per active poster, image upload error rate and report resolution time. Keep Orbit Score separate from cheap-to-generate Vibes likes; otherwise users can artificially inflate marketplace reputation.

## Threaded conversations and visible likes — October 30, 2026

**New Admin migration:** `vibes-threads-2026-10`, available under **Admin → Database Migrations**. Apply it after `vibes-2026-10`. It adds `parent_id` to the existing `vibes_comments` table with a self-reference and indexes; existing comments stay top-level. No client or wallet data is modified.

- Any signed-in user may comment directly on a visible post and reply under a specific top-level comment. Threads have two visible levels (comment + replies); replies to a reply are directed into its parent thread with an optional @mention.
- The UI shows a separate parent comment, an indented reply branch, a reply count, and **View replies / Hide replies** controls. Root comments and each child's replies paginate independently (30 per page). Editing and deletion stay author-only. Deleting a root leaves a neutral tombstone if it has live children, so established discussion is not silently lost; new replies cannot target a deleted root.
- Any signed-in user may open **See who liked this Vibe** to inspect up to 25 currently liked accounts at a time, including public names, usernames, and profile photographs with links to their public profiles. The API checks that the post is still publicly visible on every page, excludes emails and other private profile attributes, and rejects missing or removed posts.
- A like count represents unique currently active likes. The names list is live and can change after a refresh or an unlike.
- Both features preserve the existing 40-comments-per-hour limit and the original post moderation rules. Nested replies do not alter Orbit Score.

**Test coverage:** `tests/vibes-threads.test.mjs` covers migration repeatability, correct-post parent validation, maximum two-level thread depth, ownership, deleted parents, and liker visibility. `tests/vibes-hierarchy-ui.mjs` checks mobile and desktop navigation, nested replies, the liker profile list, and horizontal overflow. CI: `.github/workflows/vibes-conversations.yml`.
