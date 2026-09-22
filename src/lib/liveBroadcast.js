// Path: src/lib/liveBroadcast.js
// Minimal WHIP publisher for browser camera/microphone -> managed Live ingest.

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

export async function startWhipBroadcast({ ingestUrl, mediaStream, onConnectionState }) {
  if (!ingestUrl) throw new Error('Live ingest URL is missing.')
  const pc = new RTCPeerConnection()
  for (const track of mediaStream.getTracks()) pc.addTrack(track, mediaStream)
  pc.addEventListener('connectionstatechange', () => onConnectionState?.(pc.connectionState))

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  await waitForIceGathering(pc)

  const response = await fetch(ingestUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/sdp' },
    body: pc.localDescription.sdp,
  })
  if (!response.ok) throw new Error(`Live ingest failed (${response.status}).`)
  const answerSdp = await response.text()
  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

  return {
    peerConnection: pc,
    stop() {
      for (const sender of pc.getSenders()) sender.track?.stop()
      pc.close()
    },
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

export async function getLiveMedia({ videoDeviceId, audioDeviceId } = {}) {
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    throw new Error('Live camera and microphone access requires a secure HTTPS connection (or localhost during development).')
  }
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera and microphone access is not supported in this browser.')
  }

  const constraints = {
    video: videoDeviceId ? { deviceId: { exact: videoDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: audioDeviceId ? { deviceId: { exact: audioDeviceId }, echoCancellation: true, noiseSuppression: true } : { echoCancellation: true, noiseSuppression: true },
  }

  try {
    return await navigator.mediaDevices.getUserMedia(constraints)
  } catch (error) {
    throw mediaAccessError(error)
  }
}
