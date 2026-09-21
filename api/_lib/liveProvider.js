// Path: api/_lib/liveProvider.js
// Provider boundary for ChombuTar Live. Keep all provider-specific HTTP here.

const API_ROOT = 'https://api.cloudflare.com/client/v4'

function providerError(message, status = 502) {
  return Object.assign(new Error(message), { status })
}

function config() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN
  if (!accountId || !apiToken) {
    throw providerError('Live streaming provider is not configured.', 503)
  }
  return { accountId, apiToken }
}

async function cf(path, options = {}) {
  const { accountId, apiToken } = config()
  const response = await fetch(`${API_ROOT}/accounts/${accountId}/stream${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.success === false) {
    const message = payload?.errors?.[0]?.message || `Streaming provider request failed (${response.status}).`
    throw providerError(message, response.status >= 500 ? 502 : 400)
  }
  return payload.result
}

export async function createLiveInput({ streamId, title }) {
  const result = await cf('/live_inputs', {
    method: 'POST',
    headers: { 'Idempotency-Key': `chombutar-live-${streamId}` },
    body: JSON.stringify({
      meta: { name: title, chombutar_stream_id: streamId },
      preferLowLatency: true,
      recording: { mode: 'automatic' },
    }),
  })

  return {
    provider: 'cloudflare',
    providerInputId: result.uid,
    ingestUrl: result.webRTC?.url || result.web_rtc?.url || null,
    playbackUrl: result.playback?.hls || null,
    playbackDashUrl: result.playback?.dash || null,
    providerStatus: result.status || 'starting',
  }
}

export async function getLiveInput(providerInputId) {
  const result = await cf(`/live_inputs/${encodeURIComponent(providerInputId)}`, { method: 'GET' })
  return {
    provider: 'cloudflare',
    providerInputId: result.uid,
    playbackUrl: result.playback?.hls || null,
    playbackDashUrl: result.playback?.dash || null,
    providerStatus: result.status || null,
  }
}

export async function disableLiveInput(providerInputId) {
  const result = await cf(`/live_inputs/${encodeURIComponent(providerInputId)}`, {
    method: 'PUT',
    body: JSON.stringify({ enabled: false }),
  })
  return { providerStatus: result.status || 'ended' }
}

export function publicPlaybackUrl(playbackUrl, qualityMode = 'auto') {
  if (!playbackUrl) return null
  const url = new URL(playbackUrl)
  if (qualityMode === 'data_saver') url.searchParams.set('clientBandwidthHint', '0.7')
  if (qualityMode === 'high') url.searchParams.set('clientBandwidthHint', '4.0')
  return url.toString()
}
