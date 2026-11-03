import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolveBroadcastAvailability } from '../api/_lib/liveTransport.js'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('browser streaming is the default and cannot silently fall back to RTMP', async () => {
  const keys = ['LIVE_VIDEO_PROVIDER', 'LIVE_MEDIA_SERVER_URL', 'LIVE_WHIP_URL', 'LIVE_HLS_BASE_URL']
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  const fetchBefore = global.fetch
  try {
    for (const key of keys) delete process.env[key]
    // Even if Cloudinary API keys are present, default Live must not require OBS.
    assert.deepEqual(await resolveBroadcastAvailability(), {
      mode: 'fallback', ready: false, reason: 'unconfigured',
    })
    process.env.LIVE_MEDIA_SERVER_URL = 'https://live.example.test/health'
    process.env.LIVE_WHIP_URL = 'https://live.example.test'
    process.env.LIVE_HLS_BASE_URL = 'https://live.example.test'
    global.fetch = async () => ({
      ok: true, status: 200,
      headers: { get: name => name === 'content-type' ? 'application/json' : null },
    })
    assert.deepEqual(await resolveBroadcastAvailability(), {
      mode: 'mediamtx', ready: true, reason: null,
    })
  } finally {
    global.fetch = fetchBefore
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  }
})

test('deployment provides an HTTPS WHIP/HLS gateway and keeps raw media private', () => {
  const compose = read('infra/live/docker-compose.yml')
  const browserCompose = read('infra/live/docker-compose.browser.yml')
  const caddy = read('infra/live/Caddyfile')
  const example = read('infra/live/.env.example')
  const vercel = read('.env.example')
  assert.match(compose, /MTX_AUTHMETHOD:\s*http/)
  assert.match(compose, /MTX_AUTHHTTPADDRESS:/)
  assert.match(browserCompose, /media-tls:/)
  assert.match(browserCompose, /caddy:2/)
  assert.match(browserCompose, /"443:443"/)
  assert.match(caddy, /@health path \/health/)
  assert.match(caddy, /path_regexp .*\/whip/)
  assert.match(caddy, /reverse_proxy mediamtx:8889/)
  assert.match(caddy, /reverse_proxy mediamtx:8888/)
  assert.match(example, /LIVE_ICE_UDP_PORT=8189/)
  assert.match(example, /LIVE_HLS_PORT=127\.0\.0\.1:8888/)
  assert.match(example, /LIVE_WHIP_PORT=127\.0\.0\.1:8889/)
  assert.match(vercel, /^LIVE_VIDEO_PROVIDER=mediamtx$/m)
})

test('users publish their own browser camera through WHIP, not RTMP', () => {
  const hub = read('src/pages/Live/LiveHub.jsx')
  const broadcast = read('src/lib/liveBroadcast.js')
  const server = read('api/_lib/liveTransport.js')
  const guide = read('infra/live/README.md')
  assert.match(hub, /Go Live from camera/)
  assert.match(hub, /No OBS or stream key required/)
  assert.match(hub, /getLiveMedia\(\)/)
  assert.match(hub, /publisher=await startWhipBroadcast/)
  assert.match(hub, /await api\.liveAction\(\{action:'mark_live'/)
  assert.match(broadcast, /RTCPeerConnection/)
  assert.match(broadcast, /'Content-Type': 'application\/sdp'/)
  assert.match(server, /LIVE_VIDEO_PROVIDER\|\|'mediamtx'/)
  assert.match(guide, /two-device WHIP\/HLS test/i)
})
