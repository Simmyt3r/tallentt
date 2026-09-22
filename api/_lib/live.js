// Path: api/_lib/live.js
// ChombuTar Live: MediaMTX-backed livestreaming + real-wallet Talent Support.

import crypto from 'node:crypto'
import { query, getClient } from './db.js'
import { creditWallet, debitWallet } from './wallet.js'
import { notifyUser } from './notifications.js'
import { buildLiveMediaEndpoints, getLiveMediaMode, publicLiveMediaEndpoints, resolveLiveMediaAvailability, streamPathForId } from './liveMedia.js'
import { emitLiveEvent } from './liveRealtime.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ALLOWED_STATES = new Set(['scheduled', 'starting', 'live', 'reconnecting', 'ended', 'failed'])
const PUBLISH_STATES = new Set(['starting', 'live', 'reconnecting'])

export function liveError(status, message) {
  return Object.assign(new Error(message), { status })
}

function requireUuid(value, name = 'id') {
  const clean = String(value || '').trim()
  if (!UUID_RE.test(clean)) throw liveError(400, `A valid ${name} is required.`)
  return clean
}

function cleanText(value, max, name) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim()
  if (!clean) throw liveError(400, `${name} is required.`)
  return clean.slice(0, max)
}

function feeBps() {
  const raw = Number(process.env.LIVE_PLATFORM_FEE_BPS || 0)
  return Number.isInteger(raw) && raw >= 0 && raw <= 5000 ? raw : 0
}

function calculateFee(gross) {
  const platformFee = Math.floor((gross * feeBps()) / 10000)
  return { gross, platformFee, net: gross - platformFee }
}

function hashPublishToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest()
}

function safeTokenMatch(token, expectedHex) {
  if (!token || !expectedHex) return false
  let expected
  try { expected = Buffer.from(expectedHex, 'hex') } catch { return false }
  const actual = hashPublishToken(token)
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

function publicStream(row) {
  if (!row) return null
  const { publish_token_hash: _publishTokenHash, ...safe } = row
  const mediaMode = row.media_status === 'fallback' ? 'fallback' : getLiveMediaMode()
  const endpoints = mediaMode === 'mediamtx' && row.stream_path
    ? publicLiveMediaEndpoints(row.stream_path)
    : { hlsUrl: null }
  return { ...safe, media_mode: mediaMode, hls_url: endpoints.hlsUrl || null }
}

async function activeGiftCatalogue(client = null) {
  const runner = client || { query }
  const { rows } = await runner.query(
    `SELECT id, name, description, amount, icon, animation, active, custom_amount, sort_order
     FROM live_gift_catalogue WHERE active = true ORDER BY sort_order, amount NULLS LAST, name`,
  )
  return rows
}

async function viewerCount(streamId, client = null) {
  const runner = client || { query }
  const { rows } = await runner.query(
    `SELECT COUNT(*)::int AS count FROM live_viewers
     WHERE stream_id = $1 AND last_seen_at > NOW() - INTERVAL '35 seconds'`,
    [streamId],
  )
  return rows[0]?.count || 0
}

async function mapStream(row, viewerId) {
  if (!row) return null
  const [{ rows: likeRows }, count] = await Promise.all([
    query(`SELECT COUNT(*)::int AS count, BOOL_OR(user_id = $2) AS liked_by_me FROM live_stream_likes WHERE stream_id = $1`, [row.id, viewerId || null]),
    viewerCount(row.id),
  ])
  return {
    ...publicStream(row),
    viewer_count: count,
    likes: likeRows[0]?.count || 0,
    liked_by_me: Boolean(likeRows[0]?.liked_by_me),
    is_owner: Boolean(viewerId && viewerId === row.talent_id),
  }
}

export async function listStreams({ viewerId, status }) {
  const params = []
  const where = []
  if (status && ALLOWED_STATES.has(status)) {
    params.push(status)
    where.push(`ls.status = $${params.length}`)
  } else {
    where.push(`ls.status IN ('scheduled','starting','live','reconnecting')`)
  }
  const { rows } = await query(
    `SELECT ls.*, u.username, u.full_name, u.avatar_url, u.role, u.company_suffix
     FROM live_streams ls JOIN users u ON u.id = ls.talent_id
     WHERE ${where.join(' AND ')}
     ORDER BY CASE ls.status WHEN 'live' THEN 0 WHEN 'reconnecting' THEN 1 WHEN 'starting' THEN 2 ELSE 3 END,
              ls.started_at DESC NULLS LAST, ls.created_at DESC
     LIMIT 60`,
    params,
  )
  return Promise.all(rows.map((row) => mapStream(row, viewerId)))
}

export async function getStream(streamId, viewerId) {
  streamId = requireUuid(streamId, 'stream_id')
  const { rows } = await query(
    `SELECT ls.*, u.username, u.full_name, u.avatar_url, u.role, u.company_suffix
     FROM live_streams ls JOIN users u ON u.id = ls.talent_id WHERE ls.id = $1`,
    [streamId],
  )
  if (!rows[0]) throw liveError(404, 'Live stream not found.')
  const stream = await mapStream(rows[0], viewerId)

  const [gifts, support, top, earnings, breakdown, today] = await Promise.all([
    activeGiftCatalogue(),
    query(
      `SELECT st.id, st.gift_id, st.gross_amount, st.platform_fee, st.net_amount, st.created_at,
              gc.name AS gift_name, gc.icon,
              u.id AS supporter_id, u.username AS supporter_username, u.full_name AS supporter_full_name,
              u.avatar_url AS supporter_avatar_url, u.role AS supporter_role, u.company_suffix AS supporter_company_suffix
       FROM live_support_transactions st
       JOIN live_gift_catalogue gc ON gc.id = st.gift_id
       JOIN users u ON u.id = st.supporter_id
       WHERE st.stream_id = $1 AND st.status = 'success'
       ORDER BY st.created_at DESC LIMIT 25`,
      [streamId],
    ),
    query(
      `SELECT u.id, u.username, u.full_name, u.avatar_url, u.role, u.company_suffix,
              SUM(st.gross_amount)::int AS amount
       FROM live_support_transactions st JOIN users u ON u.id = st.supporter_id
       WHERE st.stream_id = $1 AND st.status = 'success'
       GROUP BY u.id, u.username, u.full_name, u.avatar_url, u.role, u.company_suffix
       ORDER BY amount DESC, MIN(st.created_at) ASC LIMIT 10`,
      [streamId],
    ),
    query(
      `SELECT COALESCE(SUM(gross_amount),0)::int AS gross_support,
              COALESCE(SUM(platform_fee),0)::int AS platform_fee,
              COALESCE(SUM(net_amount),0)::int AS net_earnings,
              COUNT(*)::int AS total_gifts
       FROM live_support_transactions WHERE stream_id = $1 AND status = 'success'`,
      [streamId],
    ),
    query(
      `SELECT gc.id, gc.name, gc.icon, COUNT(*)::int AS count, SUM(st.gross_amount)::int AS gross_amount
       FROM live_support_transactions st JOIN live_gift_catalogue gc ON gc.id=st.gift_id
       WHERE st.stream_id=$1 AND st.status='success'
       GROUP BY gc.id,gc.name,gc.icon ORDER BY gross_amount DESC`,
      [streamId],
    ),
    query(
      `SELECT COALESCE(SUM(net_amount),0)::int AS today_net_earnings
       FROM live_support_transactions
       WHERE talent_id=$1 AND status='success' AND created_at >= date_trunc('day', NOW())`,
      [stream.talent_id],
    ),
  ])

  return {
    ...stream,
    gifts,
    recent_support: support.rows,
    top_supporters: top.rows,
    earnings: { ...earnings.rows[0], today_net_earnings: today.rows[0]?.today_net_earnings || 0 },
    gift_breakdown: breakdown.rows,
    platform_fee_bps: feeBps(),
  }
}

export async function createStream(userId, body) {
  const title = cleanText(body.title, 120, 'Live title')
  const category = cleanText(body.category, 80, 'Talent category')

  const { rows: userRows } = await query(`SELECT id, role FROM users WHERE id = $1`, [userId])
  const user = userRows[0]
  if (!user) throw liveError(401, 'Unauthorized')
  if (!['talent', 'dual'].includes(user.role)) throw liveError(403, 'Only Talent accounts can go live.')

  const availability = await resolveLiveMediaAvailability()
  const streamId = crypto.randomUUID()
  const streamPath = streamPathForId(streamId)

  if (availability.mode === 'fallback') {
    const { rows } = await query(
      `INSERT INTO live_streams
         (id,talent_id,title,category,status,stream_path,publish_token_hash,media_status,last_media_event_at,started_at)
       VALUES ($1,$2,$3,$4,'live',$5,NULL,'fallback',NOW(),NOW())
       RETURNING *`,
      [streamId, userId, title, category, streamPath],
    )
    emitLiveEvent(streamId, 'stream_status', { status: 'live', media_status: 'fallback' })
    return {
      stream: publicStream(rows[0]),
      media_mode: 'fallback',
      fallback_reason: availability.reason,
      ingest_url: null,
      publish_token: null,
    }
  }

  const publishToken = crypto.randomBytes(32).toString('base64url')
  const tokenHash = hashPublishToken(publishToken).toString('hex')
  const endpoints = buildLiveMediaEndpoints(streamPath)

  const { rows } = await query(
    `INSERT INTO live_streams
       (id,talent_id,title,category,status,stream_path,publish_token_hash,media_status,last_media_event_at)
     VALUES ($1,$2,$3,$4,'starting',$5,$6,'authorizing',NOW())
     RETURNING *`,
    [streamId, userId, title, category, streamPath, tokenHash],
  )

  return {
    stream: publicStream(rows[0]),
    media_mode: 'mediamtx',
    ingest_url: endpoints.ingestUrl,
    publish_token: publishToken,
  }
}

async function ownerStreamForUpdate(client, userId, streamId) {
  const { rows } = await client.query(`SELECT * FROM live_streams WHERE id=$1 FOR UPDATE`, [streamId])
  const stream = rows[0]
  if (!stream) throw liveError(404, 'Live stream not found.')
  if (stream.talent_id !== userId) throw liveError(403, 'Only the Talent who created this Live can manage it.')
  return stream
}

export async function markStreamLive(userId, body) {
  const streamId = requireUuid(body.stream_id, 'stream_id')
  const client = await getClient()
  let stream
  try {
    await client.query('BEGIN')
    stream = await ownerStreamForUpdate(client, userId, streamId)
    if (stream.status === 'ended') throw liveError(409, 'This Live has already ended.')
    if (stream.status === 'failed') throw liveError(409, 'This Live publish session has failed.')
    const { rows } = await client.query(
      `UPDATE live_streams
       SET status='live', media_status='connected', started_at=COALESCE(started_at,NOW()),
           last_media_event_at=NOW(), updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [streamId],
    )
    stream = rows[0]
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
  emitLiveEvent(streamId, 'stream_status', { status: 'live', media_status: 'connected' })
  return { stream: publicStream(stream) }
}

export async function publisherState(userId, body) {
  const streamId = requireUuid(body.stream_id, 'stream_id')
  const state = cleanText(body.state, 30, 'Publisher state').toLowerCase()
  const allowed = new Set(['new', 'connecting', 'connected', 'disconnected', 'failed'])
  if (!allowed.has(state)) throw liveError(400, 'Unsupported publisher state.')

  const client = await getClient()
  let stream
  try {
    await client.query('BEGIN')
    stream = await ownerStreamForUpdate(client, userId, streamId)
    if (stream.status === 'ended') {
      await client.query('COMMIT')
      return { stream: publicStream(stream) }
    }

    let status = stream.status
    if (state === 'connected') status = 'live'
    else if (state === 'disconnected') status = stream.started_at ? 'reconnecting' : 'starting'
    else if (state === 'failed') status = 'failed'
    else if (!stream.started_at) status = 'starting'

    const { rows } = await client.query(
      `UPDATE live_streams
       SET status=$2, media_status=$3,
           started_at=CASE WHEN $2='live' THEN COALESCE(started_at,NOW()) ELSE started_at END,
           publish_token_hash=CASE WHEN $2='failed' THEN NULL ELSE publish_token_hash END,
           last_media_event_at=NOW(), updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [streamId, status, state],
    )
    stream = rows[0]
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }

  emitLiveEvent(streamId, 'stream_status', { status: stream.status, media_status: state })
  return { stream: publicStream(stream) }
}

export async function authorizeMediaPublish(body) {
  const action = String(body?.action || '').trim()
  const protocol = String(body?.protocol || '').trim().toLowerCase()
  const path = String(body?.path || '').trim()
  const token = String(body?.token || '')
  if (action !== 'publish' || protocol !== 'webrtc' || !path || !token) return false

  const { rows } = await query(
    `SELECT id, status, publish_token_hash FROM live_streams
     WHERE stream_path=$1 LIMIT 1`,
    [path],
  )
  const stream = rows[0]
  if (!stream || !PUBLISH_STATES.has(stream.status) || !safeTokenMatch(token, stream.publish_token_hash)) return false

  await query(
    `UPDATE live_streams SET media_status='connecting', last_media_event_at=NOW(), updated_at=NOW() WHERE id=$1`,
    [stream.id],
  )
  return true
}

export async function heartbeatViewer(userId, body) {
  const streamId = requireUuid(body.stream_id, 'stream_id')
  const { rows } = await query(`SELECT status FROM live_streams WHERE id=$1`, [streamId])
  if (!rows[0]) throw liveError(404, 'Live stream not found.')
  if (rows[0].status === 'ended') return { viewer_count: 0 }
  await query(
    `INSERT INTO live_viewers (stream_id,user_id,last_seen_at) VALUES ($1,$2,NOW())
     ON CONFLICT (stream_id,user_id) DO UPDATE SET last_seen_at=EXCLUDED.last_seen_at`,
    [streamId, userId],
  )
  const count = await viewerCount(streamId)
  emitLiveEvent(streamId, 'viewer_count', { viewer_count: count })
  return { viewer_count: count }
}

export async function likeStream(userId, body) {
  const streamId = requireUuid(body.stream_id, 'stream_id')
  const { rows } = await query(`SELECT status FROM live_streams WHERE id=$1`, [streamId])
  if (!rows[0]) throw liveError(404, 'Live stream not found.')
  if (!['live','reconnecting'].includes(rows[0].status)) throw liveError(409, 'This Live is not active.')
  await query(`INSERT INTO live_stream_likes (stream_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [streamId, userId])
  const { rows: totals } = await query(`SELECT COUNT(*)::int AS likes FROM live_stream_likes WHERE stream_id=$1`, [streamId])
  const likes = totals[0]?.likes || 0
  emitLiveEvent(streamId, 'likes', { likes })
  return { likes, liked_by_me: true }
}

export async function sendSupport(userId, body) {
  const streamId = requireUuid(body.stream_id, 'stream_id')
  const giftId = cleanText(body.gift_id, 64, 'Gift')
  const idempotencyKey = cleanText(body.idempotency_key, 100, 'Idempotency key')
  const client = await getClient()
  let result
  try {
    await client.query('BEGIN')
    const { rows: streamRows } = await client.query(`SELECT * FROM live_streams WHERE id=$1 FOR UPDATE`, [streamId])
    const stream = streamRows[0]
    if (!stream) throw liveError(404, 'Live stream not found.')
    if (!['live', 'reconnecting'].includes(stream.status)) throw liveError(409, 'Support can only be sent while the Talent is live.')
    if (stream.talent_id === userId) throw liveError(400, 'You cannot support your own Live.')

    const { rows: dupeRows } = await client.query(
      `SELECT * FROM live_support_transactions WHERE supporter_id=$1 AND idempotency_key=$2`,
      [userId, idempotencyKey],
    )
    if (dupeRows[0]) {
      await client.query('COMMIT')
      return { transaction: dupeRows[0], already_processed: true }
    }

    const { rows: giftRows } = await client.query(
      `SELECT * FROM live_gift_catalogue WHERE id=$1 AND active=true FOR SHARE`,
      [giftId],
    )
    const gift = giftRows[0]
    if (!gift) throw liveError(400, 'That Talent Support gift is unavailable.')

    let gross = Number(gift.amount)
    if (gift.custom_amount) {
      gross = Number(body.custom_amount)
      if (!Number.isInteger(gross) || gross < 100 || gross > 10000000) {
        throw liveError(400, 'Custom Talent Sponsor amount must be between ₦100 and ₦10,000,000.')
      }
    }
    if (!Number.isInteger(gross) || gross <= 0) throw liveError(500, 'Gift configuration is invalid.')

    const amounts = calculateFee(gross)
    await debitWallet(client, {
      userId,
      amount: amounts.gross,
      type: 'live_support_sent',
      reference: `live:${streamId}:${idempotencyKey}`,
      roomId: null,
    })
    await creditWallet(client, {
      userId: stream.talent_id,
      amount: amounts.net,
      type: 'live_support_earning',
      reference: `live-earning:${streamId}:${idempotencyKey}`,
      roomId: null,
    })

    const { rows } = await client.query(
      `INSERT INTO live_support_transactions
       (stream_id,supporter_id,talent_id,gift_id,gross_amount,platform_fee,net_amount,idempotency_key,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'success') RETURNING *`,
      [streamId, userId, stream.talent_id, gift.id, amounts.gross, amounts.platformFee, amounts.net, idempotencyKey],
    )
    result = { transaction: rows[0], gift }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    if (err.code === '23505') {
      const { rows } = await query(
        `SELECT * FROM live_support_transactions WHERE supporter_id=$1 AND idempotency_key=$2`,
        [userId, idempotencyKey],
      )
      if (rows[0]) return { transaction: rows[0], already_processed: true }
    }
    throw err
  } finally {
    client.release()
  }

  const { rows: supporterRows } = await query(
    `SELECT id,username,full_name,avatar_url,role,company_suffix FROM users WHERE id=$1`,
    [userId],
  )
  const supporter = supporterRows[0]

  emitLiveEvent(streamId, 'support', {
    transaction: {
      id: result.transaction.id,
      gift_id: result.transaction.gift_id,
      gross_amount: result.transaction.gross_amount,
      platform_fee: result.transaction.platform_fee,
      net_amount: result.transaction.net_amount,
      created_at: result.transaction.created_at,
    },
    gift: { id: result.gift.id, name: result.gift.name, icon: result.gift.icon },
    supporter,
  })

  await notifyUser({
    userId: result.transaction.talent_id,
    type: 'live_support_received',
    title: `You received ${result.gift.name}`,
    body: `${supporter?.full_name || `^${supporter?.username || 'supporter'}`} supported you with ₦${result.transaction.gross_amount.toLocaleString()}.`,
    linkUrl: `/live/stage/${streamId}`,
    metadata: { stream_id: streamId, gift_id: result.gift.id, amount: result.transaction.gross_amount },
  })

  return { ...result, already_processed: false }
}

export async function endStream(userId, body) {
  const streamId = requireUuid(body.stream_id, 'stream_id')
  const client = await getClient()
  let stream
  try {
    await client.query('BEGIN')
    stream = await ownerStreamForUpdate(client, userId, streamId)
    if (stream.status === 'ended') {
      await client.query('COMMIT')
      return { stream: publicStream(stream) }
    }
    const { rows } = await client.query(
      `UPDATE live_streams
       SET status='ended', media_status='ended', publish_token_hash=NULL,
           ended_at=NOW(), last_media_event_at=NOW(), updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [streamId],
    )
    stream = rows[0]
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }

  emitLiveEvent(streamId, 'stream_status', { status: 'ended', media_status: 'ended' })

  const { rows } = await query(
    `SELECT COALESCE(SUM(gross_amount),0)::int AS gross, COUNT(*)::int AS gifts
     FROM live_support_transactions WHERE stream_id=$1 AND status='success'`,
    [streamId],
  )
  await notifyUser({
    userId,
    type: 'live_ended',
    title: 'Your Live ended',
    body: `You received ₦${Number(rows[0]?.gross || 0).toLocaleString()} in support across ${rows[0]?.gifts || 0} gifts.`,
    linkUrl: `/live/stage/${streamId}`,
    metadata: { stream_id: streamId, gross_support: rows[0]?.gross || 0 },
  })
  return { stream: publicStream(stream) }
}

export function makeIdempotencyKey() {
  return crypto.randomUUID()
}

// Legacy admin compatibility: Arena disputes are no longer part of ChombuTar Live.
export async function resolveDispute() {
  throw liveError(410, 'Arena Live disputes are deprecated.')
}
