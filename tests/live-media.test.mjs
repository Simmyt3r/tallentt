import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildLiveMediaEndpoints,
  getLiveMediaConfig,
  getLiveMediaMode,
  publicLiveMediaEndpoints,
  streamPathForId,
} from '../api/_lib/liveMedia.js'

const keys = ['LIVE_MEDIA_SERVER_URL', 'LIVE_WHIP_URL', 'LIVE_HLS_BASE_URL']
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]))

function clearMediaEnv() {
  for (const key of keys) delete process.env[key]
}

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
  assert.equal(getLiveMediaMode(), 'mediamtx')
  assert.equal(path, 'live-11111111-1111-4111-8111-111111111111')
  assert.deepEqual(buildLiveMediaEndpoints(path), {
    ingestUrl: `https://whip.example.test/base/${path}/whip`,
    hlsUrl: `https://hls.example.test/live/${path}/index.m3u8`,
  })
  assert.equal(getLiveMediaConfig().serverUrl, 'https://media.example.test')
})

test('missing MediaMTX configuration enables serverless fallback instead of throwing', () => {
  clearMediaEnv()
  const path = streamPathForId('11111111-1111-4111-8111-111111111111')
  assert.equal(getLiveMediaMode(), 'fallback')
  assert.deepEqual(publicLiveMediaEndpoints(path), { ingestUrl: null, hlsUrl: null })
})

test('partial or credential-bearing MediaMTX configuration is rejected', () => {
  clearMediaEnv()
  process.env.LIVE_MEDIA_SERVER_URL = 'https://media.example.test'
  assert.throws(() => getLiveMediaMode(), /configuration is incomplete/)

  process.env.LIVE_MEDIA_SERVER_URL = 'https://user:pass@media.example.test'
  process.env.LIVE_WHIP_URL = 'https://whip.example.test'
  process.env.LIVE_HLS_BASE_URL = 'https://hls.example.test'
  assert.throws(() => getLiveMediaConfig(), /must not embed credentials/)
})
