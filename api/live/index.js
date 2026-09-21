// Path: api/live/index.js
import { getSessionUser } from '../_lib/auth.js'
import { json, methodNotAllowed, readBody } from '../_lib/http.js'
import {
  listStreams,
  getStream,
  createStream,
  markStreamLive,
  refreshProviderStatus,
  heartbeatViewer,
  likeStream,
  sendSupport,
  endStream,
} from '../_lib/live.js'

const POST_ACTIONS = {
  create_stream: createStream,
  mark_live: markStreamLive,
  refresh_provider_status: refreshProviderStatus,
  heartbeat_viewer: heartbeatViewer,
  like: likeStream,
  send_support: sendSupport,
  end_stream: endStream,
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const session = getSessionUser(req)
    if (!session?.sub) return json(res, 401, { error: 'Unauthorized' })

    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host}`)
      const streamId = url.searchParams.get('room_id') || url.searchParams.get('stream_id')
      if (streamId) return json(res, 200, await getStream(streamId, session.sub))
      const status = url.searchParams.get('status')
      return json(res, 200, { rooms: await listStreams({ viewerId: session.sub, status }) })
    }

    if (req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST'])
    const body = await readBody(req)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'A JSON object is required.' })
    const run = POST_ACTIONS[body.action]
    if (!run) return json(res, 400, { error: 'Unknown Live action.' })
    return json(res, 200, await run(session.sub, body))
  } catch (err) {
    if (!err.status) console.error('live API error:', err)
    return json(res, err.status || 500, { error: err.status ? err.message : 'Live request failed.' })
  }
}
