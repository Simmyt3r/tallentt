import { connectLiveRealtime } from './liveRealtime.js'

export function connectMyDealsRealtime(userId, { onChange, onState } = {}) {
  if (!userId) return { close() {} }
  return connectLiveRealtime(userId, {
    onState,
    onEvent(event) {
      if (event?.type !== 'myDeals') return
      onChange?.(event.payload || {})
    },
  })
}
