// Path: api/_lib/liveMedia.js
// MediaMTX adapter for ChombuTar Live. Missing, partial, invalid or unreachable
// media infrastructure automatically degrades to the temporary serverless fallback.

const HTTP_PROTOCOLS = new Set(['http:', 'https:'])
const STREAM_PATH_RE = /^[a-zA-Z0-9_-]{1,160}$/
const MEDIA_ENV_KEYS = ['LIVE_MEDIA_SERVER_URL', 'LIVE_WHIP_URL', 'LIVE_HLS_BASE_URL']

function mediaError(message, status = 503) {
  return Object.assign(new Error(message), { status })
}

function requiredHttpBase(name) {
  const raw = String(process.env[name] || '').trim()
  if (!raw) throw mediaError(`${name} is not configured for ChombuTar Live.`)
  let url
  try {
    url = new URL(raw)
  } catch {
    throw mediaError(`${name} must be a valid HTTP(S) URL.`, 500)
  }
  if (!HTTP_PROTOCOLS.has(url.protocol) || url.username || url.password) {
    throw mediaError(`${name} must use HTTP(S) and must not embed credentials.`, 500)
  }
  url.hash = ''
  url.search = ''
  url.pathname = url.pathname.replace(/\/+$/, '')
  return url.toString().replace(/\/$/, '')
}

function detectLiveMediaConfiguration() {
  const present = MEDIA_ENV_KEYS.filter((name) => String(process.env[name] || '').trim())
  if (present.length === 0) return { mode: 'fallback', reason: 'unconfigured' }
  if (present.length !== MEDIA_ENV_KEYS.length) return { mode: 'fallback', reason: 'incomplete' }

  try {
    getLiveMediaConfig()
    return { mode: 'mediamtx', reason: null }
  } catch (error) {
    console.error('Invalid Live media configuration; using fallback mode:', error.message)
    return { mode: 'fallback', reason: 'invalid' }
  }
}

export function getLiveMediaMode() {
  return detectLiveMediaConfiguration().mode
}

export function getLiveMediaConfig() {
  return {
    serverUrl: requiredHttpBase('LIVE_MEDIA_SERVER_URL'),
    whipBaseUrl: requiredHttpBase('LIVE_WHIP_URL'),
    hlsBaseUrl: requiredHttpBase('LIVE_HLS_BASE_URL'),
  }
}

export function streamPathForId(streamId) {
  const clean = String(streamId || '').trim().toLowerCase()
  if (!/^[0-9a-f-]{36}$/.test(clean)) throw mediaError('Invalid Live stream identifier.', 400)
  return `live-${clean}`
}

export function buildLiveMediaEndpoints(streamPath) {
  const clean = String(streamPath || '').trim()
  if (!STREAM_PATH_RE.test(clean)) throw mediaError('Invalid Live media path.', 500)
  const { whipBaseUrl, hlsBaseUrl } = getLiveMediaConfig()
  const encoded = encodeURIComponent(clean)
  return {
    ingestUrl: `${whipBaseUrl}/${encoded}/whip`,
    hlsUrl: `${hlsBaseUrl}/${encoded}/index.m3u8`,
  }
}

export function publicLiveMediaEndpoints(streamPath) {
  if (getLiveMediaMode() === 'fallback') return { ingestUrl: null, hlsUrl: null }
  return buildLiveMediaEndpoints(streamPath)
}

export async function resolveLiveMediaAvailability() {
  const detected = detectLiveMediaConfiguration()
  if (detected.mode === 'fallback') return detected

  const { serverUrl } = getLiveMediaConfig()
  try {
    const response = await fetch(serverUrl, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    })
    if (response.status >= 500) throw new Error(`HTTP ${response.status}`)
    return { mode: 'mediamtx', reason: null }
  } catch (error) {
    console.error('Live media server unreachable; using fallback mode:', error.message)
    return { mode: 'fallback', reason: 'unreachable' }
  }
}
