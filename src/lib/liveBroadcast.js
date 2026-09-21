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

export async function getLiveMedia({ videoDeviceId, audioDeviceId } = {}) {
  const constraints = {
    video: videoDeviceId ? { deviceId: { exact: videoDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: audioDeviceId ? { deviceId: { exact: audioDeviceId }, echoCancellation: true, noiseSuppression: true } : { echoCancellation: true, noiseSuppression: true },
  }
  return navigator.mediaDevices.getUserMedia(constraints)
}
