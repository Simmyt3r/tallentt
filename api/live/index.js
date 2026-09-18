// Path: api/live/index.js
// Combutar Live — Arena Hall (1v1 competitions) + Stage Hall (performances).
// One consolidated endpoint, same reasoning as api/escrows/index.js and
// api/admin/index.js: Vercel Hobby's 12-function cap, and this is already
// the 12th. Adding more Live surface later means extending this dispatch
// table, not adding new files.
import { getSessionUser } from '../_lib/auth.js'
import { json, methodNotAllowed, readBody } from '../_lib/http.js'
import {
  listGames,
  getLeaderboard,
  listRooms,
  getRoomDetail,
  createRoom,
  joinRoom,
  cancelRoom,
  backPlayer,
  reportResult,
  confirmResult,
  disputeResult,
  likeRoom,
  sendGift,
  endStage,
  challenge,
  rentSponsorSlot,
} from '../_lib/live.js'

const POST_ACTIONS = {
  create_room: createRoom,
  join_room: joinRoom,
  cancel_room: cancelRoom,
  back_player: backPlayer,
  report_result: reportResult,
  confirm_result: confirmResult,
  dispute_result: disputeResult,
  like: likeRoom,
  send_gift: sendGift,
  end_stage: endStage,
  challenge,
  rent_sponsor_slot: rentSponsorSlot,
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store')

  if (req.method === 'GET') {
    try {
      const session = getSessionUser(req)
      const url = new URL(req.url, `http://${req.headers.host}`)

      if (url.searchParams.get('games') === '1') {
        return json(res, 200, { games: await listGames() })
      }
      if (url.searchParams.get('leaderboard') === '1') {
        return json(res, 200, { leaderboard: await getLeaderboard() })
      }

      const roomId = url.searchParams.get('room_id')
      if (roomId) {
        return json(res, 200, await getRoomDetail(roomId, session?.sub))
      }

      const hall = url.searchParams.get('hall')
      const status = url.searchParams.get('status')
      return json(res, 200, { rooms: await listRooms({ hall, status, viewerId: session?.sub }) })
    } catch (err) {
      if (!err.status) console.error('live GET error:', err)
      return json(res, err.status || 500, { error: err.status ? err.message : 'Failed to load Combutar Live.' })
    }
  }

  if (req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST'])

  try {
    const session = getSessionUser(req)
    if (!session?.sub) return json(res, 401, { error: 'Unauthorized' })

    const body = await readBody(req)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'A JSON object is required.' })

    const run = POST_ACTIONS[body.action]
    if (!run) return json(res, 400, { error: 'Unknown Live action.' })

    const result = await run(session.sub, body)
    return json(res, 200, result)
  } catch (err) {
    if (!err.status) console.error('live POST error:', err)
    return json(res, err.status || 500, { error: err.status ? err.message : 'That action failed.' })
  }
}
