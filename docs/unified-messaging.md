# Unified messaging

The Inbox combines Bento deal conversations and Associate conversations in one
list, ordered by recent activity. All, Unread, Bento and Associates filters and
search narrow the same list. Existing `/messages?escrow=…`, `/chats?thread=…`
and `/inbox?tab=…` links continue to open their original conversation.

Both conversation types support quoted replies and Sent/Seen indicators. Read
receipts are recorded only while the conversation is visible and the reader is
at the latest messages. Updates use the existing polling approach; they are not
instant push updates. Associate consent/blocking and Bento payment permissions
remain enforced separately by their existing APIs.

## Deployment

Before deploying the changed API, apply `node db/migrate.js --messaging` with
`DATABASE_URL` configured. This repeatable migration adds reply references to
both message tables and read timestamps to Associate messages. The command also
applies the existing community chat migration if needed; booking tables must exist.
Fresh databases receive these fields through `db/schema.sql`.

## Validation

`node --test tests/messaging.test.mjs tests/community-chats.test.mjs tests/bento-inbox.test.mjs tests/associates-inbox.test.mjs`

The messaging database test covers read boundaries, unread counts, reply
previews, cross-conversation rejection, unauthorized access, blocked chats,
and repeatable migration execution.

After `npm run build`, run `node tests/unified-messaging-ui.mjs` for the browser
check against the production preview. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`
when using a locally installed Chromium browser. This uses mock conversations
to verify combined listings, filters, replies, read status and mobile navigation;
the database tests separately verify persistence and permissions.
