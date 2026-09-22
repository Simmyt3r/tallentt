// Path: src/lib/liveRealtime.js
// Browser-side interaction channel. Never carries audio/video media.

function makeUrl(streamId) {
  const raw = String(import.meta.env.VITE_LIVE_WS_URL || '').trim()
  if (!raw) return null
  const url = new URL(raw)
  if (!['ws:', 'wss:'].includes(url.protocol)) return null
  url.searchParams.set('stream_id', streamId)
  return url.toString()
}

export function connectLiveRealtime(streamId, { onEvent, onState } = {}) {
  const url = makeUrl(streamId)
  if (!url || typeof WebSocket === 'undefined') {
    onState?.('disabled')
    return { close() {} }
  }

  let socket = null
  let closed = false
  let retry = 0
  let timer = null

  const scheduleReconnect = () => {
    if (closed) return
    clearTimeout(timer)
    const delay = Math.min(10000, 750 * (2 ** Math.min(retry, 4)))
    retry += 1
    onState?.('reconnecting')
    timer = setTimeout(connect, delay)
  }

  const connect = () => {
    if (closed) return
    onState?.(retry ? 'reconnecting' : 'connecting')
    try {
      socket = new WebSocket(url)
    } catch {
      scheduleReconnect()
      return
    }
    socket.addEventListener('open', () => {
      retry = 0
      onState?.('connected')
    })
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data)
        if (message?.stream_id && message.stream_id !== streamId) return
        onEvent?.(message)
      } catch {}
    })
    socket.addEventListener('close', scheduleReconnect)
    socket.addEventListener('error', () => socket?.close())
  }

  connect()
  return {
    close() {
      closed = true
      clearTimeout(timer)
      socket?.close()
    },
  }
}
