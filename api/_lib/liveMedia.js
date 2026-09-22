// Path: api/_lib/liveMedia.js
// MediaMTX adapter for ChombuTar Live. Media URLs remain environment-driven.

const HTTP_PROTOCOLS = new Set(['http:', 'https:'])
const STREAM_PATH_RE = /^[a-zA-Z0-9_-]{1,160}$/

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

export async function assertLiveMediaReachable() {
  const { serverUrl } = getLiveMediaConfig()
  try {
    const response = await fetch(serverUrl, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    })
    if (response.status >= 500) throw new Error(`HTTP ${response.status}`)
  } catch (error) {
    const err = mediaError('The Live media server is unreachable. Please try again shortly.', 503)
    err.cause = error
    throw err
  }
}
