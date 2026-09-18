// Path: api/_lib/live.js
// Combutar Live — Arena Hall (1v1 competitions) + Stage Hall (performances).
// See db/schema.sql for the tables this reads and writes.
import { query, getClient } from './db.js'
import { creditWallet, debitWallet } from './wallet.js'
import { notifyUser } from './notifications.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function liveError(status, message) {
  return Object.assign(new Error(message), { status })
}

export function requireUuid(value, name = 'id') {
  const clean = String(value ?? '').trim()
  if (!UUID_RE.test(clean)) throw liveError(400, `A valid ${name} is required.`)
  return clean
}

export function requirePositiveInt(value, name) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 2147483647) throw liveError(400, `${name} must be a positive whole number.`)
  return n
}

// Fixed Orbit-Coin prices for renting a Sponsor Hall placement. Kept as a
// constant here rather than a DB-editable table — there's no admin pricing
// screen yet, so this is the one place to change list prices.
export const SPONSOR_PRICING = {
  led_ribbon: 5000,
  side_poster_left: 3000,
  side_poster_right: 3000,
  roof_screen: 8000,
  seats: 2000,
}

export const SPONSOR_PLACEMENT_LABELS = {
  led_ribbon: 'LED ribbon behind the stage',
  side_poster_left: 'Left wall poster',
  side_poster_right: 'Right wall poster',
  roof_screen: 'Roof-hanging screen',
  seats: 'Audience seats',
}

// Player pot split on Arena settlement. Must sum to 1.
const WINNER_CUT = 0.75
const PLATFORM_CUT = 0.15
const GAME_OWNER_CUT = 0.10

// Placeholder scoring — easy to retune later, documented so nobody mistakes
// it for something derived analytically.
function scoreForGift(amount) {
  return Math.max(1, Math.round(amount / 50))
}
const SCORE_PER_LIKE = 1

async function bumpLiveOrbitScore(client, userId, delta) {
  await client.query(`UPDATE users SET live_orbit_score = live_orbit_score + $1 WHERE id = $2`, [delta, userId])
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listGames() {
  const { rows } = await query(
    `SELECT code, name, verification FROM live_games WHERE active = true ORDER BY name`,
  )
  return rows
}

export async function getLeaderboard() {
  const { rows } = await query(
    `SELECT id, username, full_name, avatar_url, live_orbit_score
     FROM users WHERE live_orbit_score > 0
     ORDER BY live_orbit_score DESC, username ASC LIMIT 20`,
  )
  return rows
}

async function attachRoomExtras(rooms, viewerId) {
  if (!rooms.length) return rooms
  const ids = rooms.map((r) => r.id)

  const { rows: players } = await query(
    `SELECT rp.room_id, u.id, u.username, u.full_name, u.avatar_url
     FROM live_room_players rp JOIN users u ON u.id = rp.user_id
     WHERE rp.room_id = ANY($1) ORDER BY rp.joined_at ASC`,
    [ids],
  )
  const { rows: betTotals } = await query(
    `SELECT room_id, COUNT(*)::int as backers, COALESCE(SUM(amount), 0)::int as pool
     FROM live_bets WHERE room_id = ANY($1) GROUP BY room_id`,
    [ids],
  )
  const { rows: likeTotals } = await query(
    `SELECT room_id, COUNT(*)::int as likes FROM live_likes WHERE room_id = ANY($1) GROUP BY room_id`,
    [ids],
  )
  const { rows: giftTotals } = await query(
    `SELECT room_id, COUNT(*)::int as gifts, COALESCE(SUM(amount), 0)::int as gift_total
     FROM live_gifts WHERE room_id = ANY($1) GROUP BY room_id`,
    [ids],
  )
  const { rows: sponsorRows } = await query(
    `SELECT room_id, placement, brand_name, message FROM live_sponsor_slots WHERE room_id = ANY($1)`,
    [ids],
  )

  let myBets = []
  let myLikes = []
  if (viewerId) {
    ;[{ rows: myBets }, { rows: myLikes }] = await Promise.all([
      query(`SELECT room_id, backing_user_id, amount, status FROM live_bets WHERE room_id = ANY($1) AND user_id = $2`, [ids, viewerId]),
      query(`SELECT room_id FROM live_likes WHERE room_id = ANY($1) AND user_id = $2`, [ids, viewerId]),
    ])
  }

  const byRoom = (list, key = 'room_id') => {
    const map = new Map()
    for (const row of list) map.set(row[key], row)
    return map
  }
  const playersByRoom = new Map()
  for (const p of players) {
    if (!playersByRoom.has(p.room_id)) playersByRoom.set(p.room_id, [])
    playersByRoom.get(p.room_id).push({ id: p.id, username: p.username, full_name: p.full_name, avatar_url: p.avatar_url })
  }
  const sponsorsByRoom = new Map()
  for (const s of sponsorRows) {
    if (!sponsorsByRoom.has(s.room_id)) sponsorsByRoom.set(s.room_id, [])
    sponsorsByRoom.get(s.room_id).push(s)
  }
  const betMap = byRoom(betTotals)
  const likeMap = byRoom(likeTotals)
  const giftMap = byRoom(giftTotals)
  const myBetMap = byRoom(myBets)
  const myLikeSet = new Set(myLikes.map((r) => r.room_id))

  return rooms.map((room) => ({
    ...room,
    players: playersByRoom.get(room.id) || [],
    pot: room.hall === 'arena' ? (playersByRoom.get(room.id) || []).length * room.stake : null,
    backing: { backers: betMap.get(room.id)?.backers || 0, pool: betMap.get(room.id)?.pool || 0 },
    likes: likeMap.get(room.id)?.likes || 0,
    gifts: { count: giftMap.get(room.id)?.gifts || 0, total: giftMap.get(room.id)?.gift_total || 0 },
    sponsors: sponsorsByRoom.get(room.id) || [],
    my_bet: myBetMap.get(room.id) || null,
    liked_by_me: myLikeSet.has(room.id),
  }))
}

export async function listRooms({ hall, status, viewerId }) {
  const conditions = []
  const params = []
  if (hall) {
    params.push(hall)
    conditions.push(`hall = $${params.length}`)
  }
  if (status) {
    params.push(status)
    conditions.push(`status = $${params.length}`)
  } else {
    conditions.push(`status NOT IN ('cancelled')`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const { rows } = await query(
    `SELECT lr.*, h.username as host_username, h.full_name as host_full_name, h.avatar_url as host_avatar_url,
            h.live_orbit_score as host_live_orbit_score, g.name as game_name
     FROM live_rooms lr
     JOIN users h ON h.id = lr.host_id
     LEFT JOIN live_games g ON g.code = lr.game
     ${where}
     ORDER BY (lr.status = 'live') DESC, lr.created_at DESC
     LIMIT 60`,
    params,
  )
  for (const room of rows) await maybeAutoSettle(room)
  return attachRoomExtras(rows, viewerId)
}

export async function getRoomDetail(roomId, viewerId) {
  const { rows } = await query(
    `SELECT lr.*, h.username as host_username, h.full_name as host_full_name, h.avatar_url as host_avatar_url,
            h.live_orbit_score as host_live_orbit_score, g.name as game_name
     FROM live_rooms lr
     JOIN users h ON h.id = lr.host_id
     LEFT JOIN live_games g ON g.code = lr.game
     WHERE lr.id = $1`,
    [roomId],
  )
  const room = rows[0]
  if (!room) throw liveError(404, 'Room not found.')
  await maybeAutoSettle(room)
  const [full] = await attachRoomExtras([room], viewerId)

  const { rows: recentGifts } = await query(
    `SELECT lg.id, lg.gift_type, lg.amount, lg.created_at, u.username, u.full_name
     FROM live_gifts lg JOIN users u ON u.id = lg.sender_id
     WHERE lg.room_id = $1 ORDER BY lg.created_at DESC LIMIT 25`,
    [roomId],
  )
  return { ...full, recent_gifts: recentGifts }
}

// ---------------------------------------------------------------------------
// A reported-but-undisputed Arena result auto-settles once the dispute
// window has passed. There's no cron on this deploy, so this is checked
// lazily whenever a room is read (see listRooms/getRoomDetail above) —
// mirrors this codebase's existing "compute on read" style rather than
// adding a scheduled function.
// ---------------------------------------------------------------------------
async function maybeAutoSettle(room) {
  if (room.status !== 'reported' || !room.dispute_opened_at || !room.winner_id) return
  const elapsedMs = Date.now() - new Date(room.dispute_opened_at).getTime()
  if (elapsedMs < room.dispute_window_seconds * 1000) return
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(`SELECT * FROM live_rooms WHERE id = $1 FOR UPDATE`, [room.id])
    const fresh = rows[0]
    if (fresh && fresh.status === 'reported') {
      const settled = await settleRoom(client, fresh, fresh.winner_id)
      Object.assign(room, settled)
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('live room auto-settle failed:', err)
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Writes — Arena
// ---------------------------------------------------------------------------

export async function createRoom(userId, body) {
  const hall = body.hall === 'stage' ? 'stage' : body.hall === 'arena' ? 'arena' : null
  if (!hall) throw liveError(400, 'hall must be "arena" or "stage".')
  const title = String(body.title || '').trim().slice(0, 120)
  if (!title) throw liveError(400, 'Give the room a title.')

  if (hall === 'stage') {
    const { rows } = await query(
      `INSERT INTO live_rooms (hall, host_id, title, status, audio_only, started_at)
       VALUES ('stage', $1, $2, 'live', $3, NOW()) RETURNING *`,
      [userId, title, Boolean(body.audio_only)],
    )
    return { room: rows[0] }
  }

  const stake = requirePositiveInt(body.stake, 'stake')
  const { rows: gameRows } = await query(`SELECT code, verification FROM live_games WHERE code = $1 AND active = true`, [body.game])
  const gameRow = gameRows[0]
  if (!gameRow) throw liveError(400, 'Choose a valid game: chess, draughts, ludo, or codm.')
  const invitedUserId = body.invited_user_id ? requireUuid(body.invited_user_id, 'invited_user_id') : null
  if (invitedUserId === userId) throw liveError(400, "You can't invite yourself.")

  const client = await getClient()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `INSERT INTO live_rooms (hall, host_id, title, game, stake, verification, invited_user_id, status)
       VALUES ('arena', $1, $2, $3, $4, $5, $6, 'open') RETURNING *`,
      [userId, title, gameRow.code, stake, gameRow.verification, invitedUserId],
    )
    const room = rows[0]
    await debitWallet(client, { userId, amount: stake, type: 'live_stake', roomId: room.id })
    await client.query(`INSERT INTO live_room_players (room_id, user_id) VALUES ($1, $2)`, [room.id, userId])
    await client.query('COMMIT')
    return { room }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function joinRoom(userId, body) {
  const roomId = requireUuid(body.room_id, 'room_id')
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(`SELECT * FROM live_rooms WHERE id = $1 FOR UPDATE`, [roomId])
    const room = rows[0]
    if (!room) throw liveError(404, 'Room not found.')
    if (room.hall !== 'arena') throw liveError(400, 'Only Arena rooms can be joined as a player.')
    if (room.status !== 'open') throw liveError(409, 'This match already has its two players.')
    if (room.host_id === userId) throw liveError(400, "You're already in this match.")
    if (room.invited_user_id && room.invited_user_id !== userId) {
      throw liveError(403, 'This room is a direct invite to another talent.')
    }
    await debitWallet(client, { userId, amount: room.stake, type: 'live_stake', roomId: room.id })
    await client.query(`INSERT INTO live_room_players (room_id, user_id) VALUES ($1, $2)`, [roomId, userId])
    const { rows: updated } = await client.query(
      `UPDATE live_rooms SET status = 'live', started_at = NOW() WHERE id = $1 RETURNING *`,
      [roomId],
    )
    await client.query('COMMIT')
    return { room: updated[0] }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function cancelRoom(userId, body) {
  const roomId = requireUuid(body.room_id, 'room_id')
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(`SELECT * FROM live_rooms WHERE id = $1 FOR UPDATE`, [roomId])
    const room = rows[0]
    if (!room) throw liveError(404, 'Room not found.')
    if (room.host_id !== userId) throw liveError(403, 'Only the host can cancel this room.')
    if (room.hall === 'arena') {
      if (room.status !== 'open') throw liveError(409, 'A match already in progress cannot be cancelled here — open a dispute if something went wrong.')
      await creditWallet(client, { userId, amount: room.stake, type: 'live_stake_refund', roomId: room.id })
    } else if (room.status === 'completed' || room.status === 'cancelled') {
      throw liveError(409, 'This stage has already ended.')
    }
    const { rows: updated } = await client.query(
      `UPDATE live_rooms SET status = 'cancelled', ended_at = NOW() WHERE id = $1 RETURNING *`,
      [roomId],
    )
    await client.query('COMMIT')
    return { room: updated[0] }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// A player reports who won. Chess/Draughts ("engine" verification) settle
// immediately — Combutar plays the moves itself in a real board
// integration, so a single authoritative report is enough. NOTE: that
// board integration isn't wired up on this deploy yet; until it is, an
// "engine" report is really just one player's attestation, same trust
// level as a referee one — see the code comment on gameRow.verification
// above. Ludo/CODM ("referee" verification) open a dispute_window_seconds
// window the opponent can dispute or confirm before it auto-settles.
export async function reportResult(userId, body) {
  const roomId = requireUuid(body.room_id, 'room_id')
  const winnerId = requireUuid(body.winner_id, 'winner_id')
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(`SELECT * FROM live_rooms WHERE id = $1 FOR UPDATE`, [roomId])
    const room = rows[0]
    if (!room) throw liveError(404, 'Room not found.')
    if (room.hall !== 'arena') throw liveError(400, 'Only Arena rooms have a result to report.')
    if (room.status !== 'live') throw liveError(409, 'This match is not currently live.')
    const { rows: playerRows } = await client.query(`SELECT user_id FROM live_room_players WHERE room_id = $1`, [roomId])
    const playerIds = playerRows.map((r) => r.user_id)
    if (!playerIds.includes(userId)) throw liveError(403, 'Only the two players can report a result.')
    if (!playerIds.includes(winnerId)) throw liveError(400, 'The winner must be one of the two players.')

    if (room.verification === 'engine') {
      const settled = await settleRoom(client, room, winnerId)
      await client.query('COMMIT')
      return { room: settled }
    }

    const { rows: updated } = await client.query(
      `UPDATE live_rooms SET status = 'reported', winner_id = $1, dispute_opened_at = NOW() WHERE id = $2 RETURNING *`,
      [winnerId, roomId],
    )
    await client.query('COMMIT')
    const opponentId = playerIds.find((id) => id !== userId)
    if (opponentId) {
      await notifyUser({
        userId: opponentId,
        type: 'live_result_reported',
        title: 'Match result reported',
        body: `Your opponent reported a result for "${room.title}". You have ${room.dispute_window_seconds}s to dispute it.`,
        linkUrl: `/live/arena/${roomId}`,
        metadata: { room_id: roomId },
      })
    }
    return { room: updated[0] }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function confirmResult(userId, body) {
  const roomId = requireUuid(body.room_id, 'room_id')
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(`SELECT * FROM live_rooms WHERE id = $1 FOR UPDATE`, [roomId])
    const room = rows[0]
    if (!room) throw liveError(404, 'Room not found.')
    if (room.status !== 'reported') throw liveError(409, 'No pending result to confirm.')
    const { rows: playerRows } = await client.query(`SELECT user_id FROM live_room_players WHERE room_id = $1`, [roomId])
    if (!playerRows.some((r) => r.user_id === userId)) throw liveError(403, 'Only the two players can confirm a result.')
    const settled = await settleRoom(client, room, room.winner_id)
    await client.query('COMMIT')
    return { room: settled }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function disputeResult(userId, body) {
  const roomId = requireUuid(body.room_id, 'room_id')
  const reason = String(body.reason || '').trim().slice(0, 1000)
  if (!reason) throw liveError(400, 'Explain what you are disputing.')
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(`SELECT * FROM live_rooms WHERE id = $1 FOR UPDATE`, [roomId])
    const room = rows[0]
    if (!room) throw liveError(404, 'Room not found.')
    if (room.status !== 'reported') throw liveError(409, 'No pending result to dispute.')
    const { rows: playerRows } = await client.query(`SELECT user_id FROM live_room_players WHERE room_id = $1`, [roomId])
    if (!playerRows.some((r) => r.user_id === userId)) throw liveError(403, 'Only the two players can dispute a result.')
    const { rows: updated } = await client.query(
      `UPDATE live_rooms SET status = 'disputed', dispute_reason = $1 WHERE id = $2 RETURNING *`,
      [reason, roomId],
    )
    await client.query('COMMIT')
    return { room: updated[0] }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// Called from api/admin — a referee call, resolving a disputed Arena
// result the two players couldn't agree on themselves.
export async function resolveDispute(adminId, body) {
  const roomId = requireUuid(body.room_id, 'room_id')
  const winnerId = requireUuid(body.winner_id, 'winner_id')
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(`SELECT * FROM live_rooms WHERE id = $1 FOR UPDATE`, [roomId])
    const room = rows[0]
    if (!room) throw liveError(404, 'Room not found.')
    if (room.status !== 'disputed') throw liveError(409, 'This room has no open dispute.')
    const { rows: playerRows } = await client.query(`SELECT user_id FROM live_room_players WHERE room_id = $1`, [roomId])
    if (!playerRows.some((r) => r.user_id === winnerId)) throw liveError(400, 'The winner must be one of the two players.')
    const settled = await settleRoom(client, room, winnerId)
    await client.query(
      `INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, metadata)
       VALUES ($1, 'resolve_live_dispute', 'live_room', $2, $3::jsonb)`,
      [adminId, roomId, JSON.stringify({ winner_id: winnerId })],
    )
    await client.query('COMMIT')
    return { room: settled }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// Pays out the pot (75/15/10) and settles spectator bets parimutuel-style.
// Must be called with `client` already inside BEGIN/COMMIT, holding a row
// lock on `room` (SELECT ... FOR UPDATE) — every caller above does this.
export async function settleRoom(client, room, winnerId) {
  const { rows: playerRows } = await client.query(`SELECT user_id FROM live_room_players WHERE room_id = $1`, [room.id])
  const pot = room.stake * playerRows.length
  const winnerShare = Math.round(pot * WINNER_CUT)
  const platformShare = Math.round(pot * PLATFORM_CUT)
  const ownerShare = pot - winnerShare - platformShare // remainder absorbs rounding

  await creditWallet(client, { userId: winnerId, amount: winnerShare, type: 'live_prize', roomId: room.id })
  if (ownerShare > 0) {
    const { rows: gameRows } = await client.query(`SELECT owner_id FROM live_games WHERE code = $1`, [room.game])
    const ownerId = gameRows[0]?.owner_id
    if (ownerId) {
      await creditWallet(client, { userId: ownerId, amount: ownerShare, type: 'live_owner_share', roomId: room.id })
    }
    // No owner on file for this game yet — that share simply stays
    // unallocated with the platform, same as platformShare above.
  }

  const { rows: bets } = await client.query(
    `SELECT id, user_id, backing_user_id, amount FROM live_bets WHERE room_id = $1 AND status = 'open'`,
    [room.id],
  )
  const totalPool = bets.reduce((sum, b) => sum + b.amount, 0)
  const winningBets = bets.filter((b) => b.backing_user_id === winnerId)
  const winningPool = winningBets.reduce((sum, b) => sum + b.amount, 0)
  for (const bet of bets) {
    const won = bet.backing_user_id === winnerId
    if (won) {
      const payout = winningPool > 0 ? Math.round((bet.amount / winningPool) * totalPool) : bet.amount
      if (payout > 0) await creditWallet(client, { userId: bet.user_id, amount: payout, type: 'live_bet_payout', roomId: room.id })
      await client.query(`UPDATE live_bets SET status = 'won' WHERE id = $1`, [bet.id])
    } else {
      await client.query(`UPDATE live_bets SET status = 'lost' WHERE id = $1`, [bet.id])
    }
  }

  const { rows: settled } = await client.query(
    `UPDATE live_rooms SET status = 'completed', winner_id = $1, settled_at = NOW(), ended_at = NOW() WHERE id = $2 RETURNING *`,
    [winnerId, room.id],
  )

  for (const p of playerRows) {
    await notifyUser({
      userId: p.user_id,
      type: 'live_match_settled',
      title: p.user_id === winnerId ? 'You won the match!' : 'Match settled',
      body: p.user_id === winnerId
        ? `You won "${room.title}" and earned Orbit Coins in your wallet.`
        : `"${room.title}" has been settled. Better luck next time.`,
      linkUrl: `/live/arena/${room.id}`,
      metadata: { room_id: room.id },
    })
  }

  return settled[0]
}

// ---------------------------------------------------------------------------
// Writes — Stage
// ---------------------------------------------------------------------------

export async function endStage(userId, body) {
  const roomId = requireUuid(body.room_id, 'room_id')
  const { rows } = await query(
    `UPDATE live_rooms SET status = 'completed', ended_at = NOW()
     WHERE id = $1 AND hall = 'stage' AND host_id = $2 AND status = 'live' RETURNING *`,
    [roomId, userId],
  )
  if (!rows[0]) throw liveError(409, 'This stage is not currently live, or you are not the host.')
  return { room: rows[0] }
}

// One-way — see the schema comment on live_likes for why this doesn't
// toggle off the way hat_likes does.
export async function likeRoom(userId, body) {
  const roomId = requireUuid(body.room_id, 'room_id')
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const { rows: roomRows } = await client.query(`SELECT * FROM live_rooms WHERE id = $1`, [roomId])
    const room = roomRows[0]
    if (!room || room.hall !== 'stage') throw liveError(404, 'Stage not found.')
    const { rowCount } = await client.query(
      `INSERT INTO live_likes (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [roomId, userId],
    )
    if (rowCount > 0) await bumpLiveOrbitScore(client, room.host_id, SCORE_PER_LIKE)
    await client.query('COMMIT')
    return { already_liked: rowCount === 0 }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function sendGift(userId, body) {
  const roomId = requireUuid(body.room_id, 'room_id')
  const amount = requirePositiveInt(body.amount, 'amount')
  const giftType = String(body.gift_type || '').trim().slice(0, 40) || 'gift'
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const { rows: roomRows } = await client.query(`SELECT * FROM live_rooms WHERE id = $1 FOR UPDATE`, [roomId])
    const room = roomRows[0]
    if (!room || room.hall !== 'stage') throw liveError(404, 'Stage not found.')
    if (room.status !== 'live') throw liveError(409, 'This stage is not currently live.')
    if (room.host_id === userId) throw liveError(400, "You can't gift your own stage.")

    await debitWallet(client, { userId, amount, type: 'live_gift_sent', roomId: room.id })
    await creditWallet(client, { userId: room.host_id, amount, type: 'live_gift_earning', roomId: room.id })
    await client.query(
      `INSERT INTO live_gifts (room_id, sender_id, gift_type, amount) VALUES ($1, $2, $3, $4)`,
      [roomId, userId, giftType, amount],
    )
    await bumpLiveOrbitScore(client, room.host_id, scoreForGift(amount))
    await client.query('COMMIT')
    return { ok: true }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// Stage → Arena: "I challenge you to a Draught match" — creates a fresh
// Arena room with the current stage host as host and the picked viewer as
// the sole invitee (see invited_user_id on live_rooms/joinRoom above).
export async function challenge(userId, body) {
  const roomId = requireUuid(body.room_id, 'room_id')
  let targetUserId = body.target_user_id ? requireUuid(body.target_user_id, 'target_user_id') : null
  if (!targetUserId && body.target_username) {
    const { rows } = await query(`SELECT id FROM users WHERE LOWER(username) = LOWER($1)`, [String(body.target_username).trim().replace(/^@/, '')])
    if (!rows[0]) throw liveError(404, `No talent found with username "${body.target_username}".`)
    targetUserId = rows[0].id
  }
  if (!targetUserId) throw liveError(400, 'target_user_id or target_username is required.')
  const { rows: stageRows } = await query(`SELECT * FROM live_rooms WHERE id = $1`, [roomId])
  const stage = stageRows[0]
  if (!stage || stage.hall !== 'stage') throw liveError(404, 'Stage not found.')
  if (stage.host_id !== userId) throw liveError(403, 'Only the host can issue a challenge from this stage.')
  if (targetUserId === userId) throw liveError(400, "You can't challenge yourself.")

  const arena = await createRoom(userId, {
    hall: 'arena',
    title: `${body.title || 'Stage challenge'}`.slice(0, 120),
    game: body.game,
    stake: body.stake,
    invited_user_id: targetUserId,
  })

  await notifyUser({
    userId: targetUserId,
    type: 'live_challenge',
    title: "You've been challenged!",
    body: `You were challenged to a match. Join the Arena room to accept.`,
    linkUrl: `/live/arena/${arena.room.id}`,
    metadata: { room_id: arena.room.id, from_stage_id: roomId },
  })

  return arena
}

// ---------------------------------------------------------------------------
// Writes — Arena spectator backing
// ---------------------------------------------------------------------------

export async function backPlayer(userId, body) {
  const roomId = requireUuid(body.room_id, 'room_id')
  const backingUserId = requireUuid(body.backing_user_id, 'backing_user_id')
  const amount = requirePositiveInt(body.amount, 'amount')
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const { rows: roomRows } = await client.query(`SELECT * FROM live_rooms WHERE id = $1 FOR UPDATE`, [roomId])
    const room = roomRows[0]
    if (!room || room.hall !== 'arena') throw liveError(404, 'Arena room not found.')
    if (!['open', 'live'].includes(room.status)) throw liveError(409, 'Backing has closed for this match.')
    const { rows: playerRows } = await client.query(`SELECT user_id FROM live_room_players WHERE room_id = $1`, [roomId])
    const playerIds = playerRows.map((r) => r.user_id)
    if (playerIds.includes(userId)) throw liveError(400, "Players can't back their own match.")
    if (!playerIds.includes(backingUserId)) throw liveError(400, 'You can only back one of the two players.')

    await debitWallet(client, { userId, amount, type: 'live_bet_stake', roomId: room.id })
    const { rows } = await client.query(
      `INSERT INTO live_bets (room_id, user_id, backing_user_id, amount) VALUES ($1, $2, $3, $4)
       ON CONFLICT (room_id, user_id) DO NOTHING RETURNING *`,
      [roomId, userId, backingUserId, amount],
    )
    if (!rows[0]) throw liveError(409, "You've already backed a player in this match.")
    await client.query('COMMIT')
    return { bet: rows[0] }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Writes — Sponsor Hall
// ---------------------------------------------------------------------------

export async function rentSponsorSlot(userId, body) {
  const roomId = requireUuid(body.room_id, 'room_id')
  const placement = String(body.placement || '')
  if (!SPONSOR_PRICING[placement]) throw liveError(400, 'Choose a valid placement.')
  const brandName = String(body.brand_name || '').trim().slice(0, 60)
  if (!brandName) throw liveError(400, 'A brand name is required.')
  const message = body.message ? String(body.message).trim().slice(0, 140) : null
  const rainAmount = body.rain_amount ? requirePositiveInt(body.rain_amount, 'rain_amount') : 0
  const price = SPONSOR_PRICING[placement]

  const client = await getClient()
  try {
    await client.query('BEGIN')
    const { rows: roomRows } = await client.query(`SELECT * FROM live_rooms WHERE id = $1 FOR UPDATE`, [roomId])
    const room = roomRows[0]
    if (!room || room.hall !== 'stage') throw liveError(404, 'Stage not found.')
    if (room.status !== 'live') throw liveError(409, 'This stage is not currently live.')

    const totalCost = price + rainAmount
    await debitWallet(client, { userId, amount: totalCost, type: 'live_sponsor_rent', roomId: room.id })

    const { rows } = await client.query(
      `INSERT INTO live_sponsor_slots (room_id, sponsor_id, placement, brand_name, message, rain_amount, amount_paid)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (room_id, placement) DO UPDATE SET
         sponsor_id = EXCLUDED.sponsor_id, brand_name = EXCLUDED.brand_name,
         message = EXCLUDED.message, rain_amount = EXCLUDED.rain_amount, amount_paid = EXCLUDED.amount_paid,
         created_at = NOW()
       RETURNING *`,
      [roomId, userId, placement, brandName, message, rainAmount, totalCost],
    )

    // "Rain" Orbit Coins on the current audience — the closest proxy this
    // deploy has for "who's watching" is everyone who has liked or gifted
    // this room so far (see the schema comment on live_sponsor_slots).
    // No audience yet? The rain simply isn't distributed — the sponsor
    // still gets the placement itself, which is the part being paid for.
    if (rainAmount > 0) {
      const { rows: audienceRows } = await client.query(
        `SELECT user_id FROM live_likes WHERE room_id = $1
         UNION
         SELECT sender_id FROM live_gifts WHERE room_id = $1`,
        [roomId],
      )
      const audience = audienceRows.map((r) => r.user_id).filter((id) => id !== room.host_id)
      if (audience.length > 0) {
        const share = Math.floor(rainAmount / audience.length)
        if (share > 0) {
          for (const memberId of audience) {
            await creditWallet(client, { userId: memberId, amount: share, type: 'live_sponsor_rain', roomId: room.id })
          }
        }
      }
    }

    await client.query('COMMIT')
    return { slot: rows[0] }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
