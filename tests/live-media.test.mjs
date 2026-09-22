import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildLiveMediaEndpoints,
  getLiveMediaConfig,
  getLiveMediaMode,
  publicLiveMediaEndpoints,
  resolveLiveMediaAvailability,
  streamPathForId,
} from '../api/_lib/liveMedia.js'

const keys = ['LIVE_MEDIA_SERVER_URL', 'LIVE_WHIP_URL', 'LIVE_HLS_BASE_URL']
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]))

function clearMediaEnv() {
  for (const key of keys) delete process.env[key]
}

test.afterEach(clearMediaEnv)

test.after(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

test('MediaMTX adapter builds WHIP and HLS URLs from environment configuration', () => {
  process.env.LIVE_MEDIA_SERVER_URL = 'https://media.example.test/'
  process.env.LIVE_WHIP_URL = 'https://whip.example.test/base/'
  process.env.LIVE_HLS_BASE_URL = 'https://hls.example.test/live/'
  const path = streamPathForId('11111111-1111-4111-8111-111111111111')
  assert.equal(path, 'live-11111111-1111-4111-8111-111111111111')
  assert.equal(getLiveMediaMode(), 'mediamtx')
  assert.deepEqual(buildLiveMediaEndpoints(path), {
    ingestUrl: `https://whip.example.test/base/${path}/whip`,
    hlsUrl: `https://hls.example.test/live/${path}/index.m3u8`,
  })
  assert.equal(getLiveMediaConfig().serverUrl, 'https://media.example.test')
})

test('Live media uses fallback when MediaMTX is not configured', async () => {
  clearMediaEnv()
  const path = streamPathForId('11111111-1111-4111-8111-111111111111')
  assert.equal(getLiveMediaMode(), 'fallback')
  assert.deepEqual(publicLiveMediaEndpoints(path), { ingestUrl: null, hlsUrl: null })
  assert.deepEqual(await resolveLiveMediaAvailability(), { mode: 'fallback', reason: 'unconfigured' })
})

test('Partial MediaMTX configuration falls back instead of failing Live', async () => {
  process.env.LIVE_WHIP_URL = 'https://whip.example.test'
  assert.equal(getLiveMediaMode(), 'fallback')
  assert.deepEqual(await resolveLiveMediaAvailability(), { mode: 'fallback', reason: 'incomplete' })
})

test('Invalid MediaMTX configuration falls back while strict config access still validates', async () => {
  process.env.LIVE_MEDIA_SERVER_URL = 'https://media.example.test'
  process.env.LIVE_WHIP_URL = 'https://user:pass@whip.example.test'
  process.env.LIVE_HLS_BASE_URL = 'https://hls.example.test'

  assert.equal(getLiveMediaMode(), 'fallback')
  assert.deepEqual(await resolveLiveMediaAvailability(), { mode: 'fallback', reason: 'invalid' })
  assert.throws(() => getLiveMediaConfig(), /must not embed credentials/)
})
