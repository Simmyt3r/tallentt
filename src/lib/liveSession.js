// Path: src/lib/liveSession.js
// Keeps the in-memory WHIP publisher alive while React routes change.
// A page refresh necessarily ends this browser-owned publishing session.

let active = null

export function setLivePublisher(streamId, publisher) {
  active?.publisher?.stop?.().catch?.(() => {})
  active = { streamId, publisher }
}

export function getLivePublisher(streamId) {
  return active?.streamId === streamId ? active.publisher : null
}

export async function clearLivePublisher(streamId, { stop = true } = {}) {
  if (!active || (streamId && active.streamId !== streamId)) return
  const current = active
  active = null
  if (stop) await current.publisher?.stop?.()
}
