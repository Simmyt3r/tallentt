// Path: api/_lib/liveRealtime.js
// Server-side adapter: Vercel publishes interaction events to an external relay;
// the relay fans them out to browser WebSocket clients. Media never passes here.

function realtimeConfig() {
  const publishUrl = String(process.env.LIVE_REALTIME_PUBLISH_URL || '').trim()
  if (!publishUrl) return null
  const secret = String(process.env.LIVE_REALTIME_SECRET || '').trim()
  if (!secret) throw new Error('LIVE_REALTIME_SECRET is required when LIVE_REALTIME_PUBLISH_URL is configured.')
  const url = new URL(publishUrl)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('LIVE_REALTIME_PUBLISH_URL must use HTTP(S).')
  if (url.username || url.password) throw new Error('LIVE_REALTIME_PUBLISH_URL must not embed credentials.')
  return { publishUrl: url.toString(), secret }
}

export async function publishLiveEvent(streamId, type, payload = {}) {
  const config = realtimeConfig()
  if (!config) return false
  const response = await fetch(config.publishUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ stream_id: streamId, type, payload }),
    signal: AbortSignal.timeout(2500),
  })
  if (!response.ok) throw new Error(`Live realtime relay rejected event (${response.status}).`)
  return true
}

export function emitLiveEvent(streamId, type, payload = {}) {
  publishLiveEvent(streamId, type, payload).catch((error) => {
    console.error('live realtime publish failed:', error.message)
  })
}
