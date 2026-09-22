import http from 'node:http'
import crypto from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'

const PORT = Number(process.env.PORT || 8787)
const SECRET = String(process.env.LIVE_REALTIME_SECRET || '')
const MAX_BODY = 64 * 1024
const STREAM_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ALLOWED_ORIGINS = new Set(
  String(process.env.LIVE_ALLOWED_ORIGIN || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
)

if (!SECRET) throw new Error('LIVE_REALTIME_SECRET is required.')

function timingSafeSecret(value) {
  const left = Buffer.from(String(value || ''))
  const right = Buffer.from(SECRET)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_BODY) throw Object.assign(new Error('Body too large'), { status: 413 })
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

const rooms = new Map()
function addClient(streamId, socket) {
  const room = rooms.get(streamId) || new Set()
  room.add(socket)
  rooms.set(streamId, room)
  socket.once('close', () => {
    room.delete(socket)
    if (!room.size) rooms.delete(streamId)
  })
}

function broadcast(streamId, message) {
  const room = rooms.get(streamId)
  if (!room?.size) return 0
  const body = JSON.stringify(message)
  let sent = 0
  for (const socket of room) {
    if (socket.readyState !== WebSocket.OPEN) continue
    socket.send(body)
    sent += 1
  }
  return sent
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost')
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true })
    if (req.method !== 'POST' || url.pathname !== '/events') return json(res, 404, { error: 'Not found' })

    const auth = String(req.headers.authorization || '')
    if (!auth.startsWith('Bearer ') || !timingSafeSecret(auth.slice(7))) {
      return json(res, 401, { error: 'Unauthorized' })
    }

    const body = await readJson(req)
    const streamId = String(body.stream_id || '')
    const type = String(body.type || '').trim()
    if (!STREAM_ID_RE.test(streamId) || !type || type.length > 80) {
      return json(res, 400, { error: 'Invalid Live event' })
    }
    const message = { stream_id: streamId, type, payload: body.payload || {}, at: new Date().toISOString() }
    const recipients = broadcast(streamId, message)
    return json(res, 202, { ok: true, recipients })
  } catch (error) {
    return json(res, error.status || 400, { error: error.message || 'Bad request' })
  }
})

const wss = new WebSocketServer({ noServer: true })
server.on('upgrade', (req, socket, head) => {
  try {
    const url = new URL(req.url, 'http://localhost')
    const origin = String(req.headers.origin || '')
    const streamId = String(url.searchParams.get('stream_id') || '')
    if (url.pathname !== '/live' || !STREAM_ID_RE.test(streamId)) return socket.destroy()
    if (ALLOWED_ORIGINS.size && !ALLOWED_ORIGINS.has(origin)) return socket.destroy()
    wss.handleUpgrade(req, socket, head, (ws) => {
      addClient(streamId, ws)
      ws.send(JSON.stringify({ stream_id: streamId, type: 'ready', payload: {} }))
    })
  } catch {
    socket.destroy()
  }
})

const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.isAlive === false) {
      socket.terminate()
      continue
    }
    socket.isAlive = false
    socket.ping()
  }
}, 30000)

wss.on('connection', (socket) => {
  socket.isAlive = true
  socket.on('pong', () => { socket.isAlive = true })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`ChombuTar Live realtime relay listening on :${PORT}`)
})

function shutdown() {
  clearInterval(heartbeat)
  for (const socket of wss.clients) socket.close(1001, 'Server shutting down')
  server.close(() => process.exit(0))
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
