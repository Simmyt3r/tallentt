// Path: src/lib/liveBroadcast.js
// Browser camera/microphone -> WebRTC/WHIP -> MediaMTX.

function waitForIceGathering(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', onChange)
        resolve()
      }
    }
    pc.addEventListener('icegatheringstatechange', onChange)
  })
}

function waitForConnected(pc, timeoutMs = 12000) {
  if (pc.connectionState === 'connected') return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('MediaMTX accepted the broadcast, but the WebRTC connection could not be established.')), timeoutMs)
    const onState = () => {
      if (pc.connectionState === 'connected') finish()
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        finish(new Error('The WebRTC connection to MediaMTX failed. Check the media server and ICE/TURN configuration.'))
      }
    }
    const finish = (error) => {
      clearTimeout(timer)
      pc.removeEventListener('connectionstatechange', onState)
      if (error) reject(error)
      else resolve()
    }
    pc.addEventListener('connectionstatechange', onState)
  })
}

function parseIceServers() {
  const raw = String(import.meta.env.VITE_LIVE_ICE_SERVERS_JSON || '').trim()
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function hlsCompatibleVideoCodecs() {
  const codecs = globalThis.RTCRtpSender?.getCapabilities?.('video')?.codecs || []
  if (!codecs.length) return []
  const preferred = []
  for (const mime of ['video/H264', 'video/VP9']) {
    preferred.push(...codecs.filter((codec) => codec.mimeType?.toLowerCase() === mime.toLowerCase()))
  }
  return preferred
}

function attachTrack(pc, track, stream) {
  if (track.kind !== 'video') {
    pc.addTrack(track, stream)
    return
  }

  const compatible = hlsCompatibleVideoCodecs()
  if (globalThis.RTCRtpSender?.getCapabilities && !compatible.length) {
    throw new Error('This browser cannot publish an H.264 or VP9 video track required for HLS playback.')
  }

  let transceiver
  try {
    transceiver = pc.addTransceiver(track, {
      direction: 'sendonly',
      streams: [stream],
      sendEncodings: [
        { rid: 'low', scaleResolutionDownBy: 2, maxBitrate: 450000 },
        { rid: 'mid', scaleResolutionDownBy: 1.5, maxBitrate: 1000000 },
        { rid: 'high', scaleResolutionDownBy: 1, maxBitrate: 2500000 },
      ],
    })
  } catch {
    transceiver = pc.addTransceiver(track, { direction: 'sendonly', streams: [stream] })
  }

  if (compatible.length && transceiver.setCodecPreferences) {
    transceiver.setCodecPreferences(compatible)
  }
}

function mediaAccessError(error) {
  const messages = {
    NotAllowedError: 'Camera and microphone access was denied. Allow camera and microphone for this site in your browser settings, then try again.',
    NotFoundError: 'No usable camera or microphone was found. Connect both devices, then try again.',
    NotReadableError: 'Your camera or microphone is already in use or unavailable to the browser. Close other apps using it, then try again.',
    OverconstrainedError: 'The selected camera or microphone is unavailable. Choose another device and try again.',
    SecurityError: 'Your browser blocked camera or microphone access because of its security settings.',
  }
  const message = messages[error?.name]
  if (!message) return error
  const normalized = new Error(message)
  normalized.name = error.name
  normalized.cause = error
  return normalized
}


export function startFallbackBroadcast({ mediaStream, onConnectionState }) {
  if (!mediaStream?.getTracks?.().length) throw new Error('Camera and microphone media is not available.')

  const listeners = new Set()
  if (onConnectionState) listeners.add(onConnectionState)
  let stopped = false
  const notify = (state) => {
    for (const listener of listeners) {
      try { listener(state) } catch {}
    }
  }

  queueMicrotask(() => notify('connected'))

  return {
    mode: 'fallback',
    mediaStream,
    peerConnection: null,
    get connectionState() { return stopped ? 'closed' : 'connected' },
    subscribeConnection(listener) {
      listeners.add(listener)
      listener(stopped ? 'closed' : 'connected')
      return () => listeners.delete(listener)
    },
    async stop() {
      if (stopped) return
      stopped = true
      for (const track of mediaStream.getTracks()) track.stop()
      notify('closed')
    },
  }
}

export async function startWhipBroadcast({ ingestUrl, publishToken, mediaStream, onConnectionState }) {
  if (!ingestUrl) throw new Error('Live WHIP URL is missing.')
  if (!publishToken) throw new Error('Live publish authorization is missing.')
  if (!globalThis.RTCPeerConnection) throw new Error('WebRTC publishing is not supported in this browser.')
  if (!mediaStream?.getTracks?.().length) throw new Error('Camera and microphone media is not available.')

  const pc = new RTCPeerConnection({ iceServers: parseIceServers() })
  const listeners = new Set()
  if (onConnectionState) listeners.add(onConnectionState)
  let resourceUrl = null
  let stopped = false

  const notifyState = () => {
    for (const listener of listeners) {
      try { listener(pc.connectionState) } catch {}
    }
  }
  pc.addEventListener('connectionstatechange', notifyState)

  try {
    for (const track of mediaStream.getTracks()) attachTrack(pc, track, mediaStream)

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await waitForIceGathering(pc)

    let response
    try {
      response = await fetch(ingestUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${publishToken}`,
          'Content-Type': 'application/sdp',
        },
        body: pc.localDescription.sdp,
      })
    } catch (error) {
      const unavailable = new Error('MediaMTX is unreachable from this browser. Check your connection and the Live media server.')
      unavailable.cause = error
      throw unavailable
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error('MediaMTX rejected this Live publish session. Start a new Live and try again.')
    }
    if (!response.ok) throw new Error(`WHIP publish failed (${response.status}).`)

    const location = response.headers.get('Location')
    if (location) resourceUrl = new URL(location, ingestUrl).toString()
    const answerSdp = await response.text()
    if (!answerSdp.trim()) throw new Error('MediaMTX returned an empty WHIP answer.')
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })
    await waitForConnected(pc)
  } catch (error) {
    pc.removeEventListener('connectionstatechange', notifyState)
    pc.close()
    throw error
  }

  return {
    peerConnection: pc,
    mediaStream,
    get connectionState() { return pc.connectionState },
    subscribeConnection(listener) {
      listeners.add(listener)
      listener(pc.connectionState)
      return () => listeners.delete(listener)
    },
    async stop() {
      if (stopped) return
      stopped = true
      if (resourceUrl) {
        fetch(resourceUrl, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${publishToken}` },
          keepalive: true,
        }).catch(() => {})
      }
      for (const sender of pc.getSenders()) sender.track?.stop()
      pc.removeEventListener('connectionstatechange', notifyState)
      pc.close()
      notifyState()
    },
  }
}

export async function getLiveMedia({ videoDeviceId, audioDeviceId } = {}) {
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    throw new Error('Live camera and microphone access requires a secure HTTPS connection (or localhost during development).')
  }
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera and microphone access is not supported in this browser.')
  }

  const constraints = {
    video: videoDeviceId
      ? { deviceId: { exact: videoDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }
      : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
    audio: audioDeviceId
      ? { deviceId: { exact: audioDeviceId }, echoCancellation: true, noiseSuppression: true }
      : { echoCancellation: true, noiseSuppression: true },
  }

  try {
    return await navigator.mediaDevices.getUserMedia(constraints)
  } catch (error) {
    throw mediaAccessError(error)
  }
}
