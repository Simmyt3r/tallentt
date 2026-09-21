// Path: api/_lib/live.js
// ChombuTar Live: one-to-many talent livestreaming + real wallet support.
import crypto from 'node:crypto'
import { query, getClient } from './db.js'
import { creditWallet, debitWallet } from './wallet.js'
import { notifyUser } from './notifications.js'
import { createLiveInput, disableLiveInput, getLiveInput } from './liveProvider.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ALLOWED_STATES = new Set(['scheduled', 'starting', 'live', 'reconnecting', 'ended', 'failed'])

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
    ...row,
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
    `SELECT ls.*, u.username, u.full_name, u.avatar_url, u.role
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
    `SELECT ls.*, u.username, u.full_name, u.avatar_url, u.role
     FROM live_streams ls JOIN users u ON u.id = ls.talent_id WHERE ls.id = $1`,
    [streamId],
  )
  if (!rows[0]) throw liveError(404, 'Live stream not found.')
  const stream = await mapStream(rows[0], viewerId)

  const [gifts, support, top, earnings, breakdown, today] = await Promise.all([
    activeGiftCatalogue(),
    query(
      `SELECT st.id, st.gift_id, st.gross_amount, st.created_at,
              gc.name AS gift_name, gc.icon,
              u.id AS supporter_id, u.username AS supporter_username, u.full_name AS supporter_full_name,
              u.avatar_url AS supporter_avatar_url, u.role AS supporter_role
       FROM live_support_transactions st
       JOIN live_gift_catalogue gc ON gc.id = st.gift_id
       JOIN users u ON u.id = st.supporter_id
       WHERE st.stream_id = $1 AND st.status = 'success'
       ORDER BY st.created_at DESC LIMIT 25`,
      [streamId],
    ),
    query(
      `SELECT u.id, u.username, u.full_name, u.avatar_url, u.role,
              SUM(st.gross_amount)::int AS amount
       FROM live_support_transactions st JOIN users u ON u.id = st.supporter_id
       WHERE st.stream_id = $1 AND st.status = 'success'
       GROUP BY u.id, u.username, u.full_name, u.avatar_url, u.role
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

  const client = await getClient()
  let stream
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `INSERT INTO live_streams (talent_id, title, category, status, provider)
       VALUES ($1,$2,$3,'starting','cloudflare') RETURNING *`,
      [userId, title, category],
    )
    stream = rows[0]
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }

  try {
    const provider = await createLiveInput({ streamId: stream.id, title })
    const { rows } = await query(
      `UPDATE live_streams
       SET provider_input_id=$1, playback_url=$2, playback_dash_url=$3, provider_status=$4, updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [provider.providerInputId, provider.playbackUrl, provider.playbackDashUrl, provider.providerStatus, stream.id],
    )
    return { stream: rows[0], ingest_url: provider.ingestUrl }
  } catch (err) {
    await query(`UPDATE live_streams SET status='failed', updated_at=NOW() WHERE id=$1`, [stream.id]).catch(() => {})
    throw err
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
    const { rows } = await client.query(
      `UPDATE live_streams SET status='live', started_at=COALESCE(started_at,NOW()), updated_at=NOW()
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
  return { stream }
}

export async function refreshProviderStatus(userId, body) {
  const streamId = requireUuid(body.stream_id, 'stream_id')
  const { rows } = await query(`SELECT * FROM live_streams WHERE id=$1`, [streamId])
  const stream = rows[0]
  if (!stream) throw liveError(404, 'Live stream not found.')
  if (stream.talent_id !== userId) throw liveError(403, 'Only the Talent who owns this Live can refresh it.')
  if (!stream.provider_input_id) return { stream }
  const provider = await getLiveInput(stream.provider_input_id)
  const mapped = provider.providerStatus === 'connected' ? 'live'
    : provider.providerStatus === 'reconnecting' ? 'reconnecting'
      : stream.status
  const { rows: updated } = await query(
    `UPDATE live_streams SET provider_status=$1, status=$2, playback_url=COALESCE($3,playback_url),
     playback_dash_url=COALESCE($4,playback_dash_url), updated_at=NOW() WHERE id=$5 RETURNING *`,
    [provider.providerStatus, mapped, provider.playbackUrl, provider.playbackDashUrl, streamId],
  )
  return { stream: updated[0] }
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
  return { viewer_count: await viewerCount(streamId) }
}


export async function likeStream(userId, body) {
  const streamId = requireUuid(body.stream_id, 'stream_id')
  const { rows } = await query(`SELECT status FROM live_streams WHERE id=$1`, [streamId])
  if (!rows[0]) throw liveError(404, 'Live stream not found.')
  if (!['live','reconnecting'].includes(rows[0].status)) throw liveError(409, 'This Live is not active.')
  await query(`INSERT INTO live_stream_likes (stream_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [streamId, userId])
  const { rows: totals } = await query(`SELECT COUNT(*)::int AS likes FROM live_stream_likes WHERE stream_id=$1`, [streamId])
  return { likes: totals[0]?.likes || 0, liked_by_me: true }
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

  const { rows: supporterRows } = await query(`SELECT username,full_name FROM users WHERE id=$1`, [userId])
  const supporter = supporterRows[0]
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
      return { stream }
    }
    const { rows } = await client.query(
      `UPDATE live_streams SET status='ended', ended_at=NOW(), updated_at=NOW() WHERE id=$1 RETURNING *`,
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

  if (stream.provider_input_id) disableLiveInput(stream.provider_input_id).catch((err) => console.error('disable live input failed:', err))
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
  return { stream }
}

export function makeIdempotencyKey() {
  return crypto.randomUUID()
}

// Legacy admin compatibility: Arena disputes are no longer part of ChombuTar Live.
// Keep the export so the existing consolidated admin endpoint continues to load.
export async function resolveDispute() {
  throw liveError(410, 'Arena Live disputes are deprecated.')
}
