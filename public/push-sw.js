self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload = {}
    try {
      payload = event.data ? event.data.json() : {}
    } catch {
      payload = { title: 'ChombuTar', body: event.data ? event.data.text() : '' }
    }

    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const visible = windows.some((client) => client.visibilityState === 'visible')
    if (visible) {
      for (const client of windows) {
        client.postMessage({ type: 'push:notification', notification: payload })
      }
      return
    }

    await self.registration.showNotification(payload.title || 'ChombuTar', {
      body: payload.body || '',
      icon: payload.icon || '/icons/icon-192.png',
      badge: payload.badge || '/icons/icon-192-maskable.png',
      tag: payload.tag || 'chombutar-notification',
      renotify: false,
      data: {
        url: payload.url || '/notifications',
        notificationId: payload.notificationId || null,
        type: payload.type || 'system',
      },
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil((async () => {
    let destination = '/notifications'
    try {
      const candidate = new URL(event.notification.data?.url || '/notifications', self.location.origin)
      if (candidate.origin === self.location.origin) destination = candidate.pathname + candidate.search + candidate.hash
    } catch {}

    const target = new URL(destination, self.location.origin).href
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin)
    if (existing) {
      if ('navigate' in existing) await existing.navigate(target)
      return existing.focus()
    }
    return self.clients.openWindow(target)
  })())
})
