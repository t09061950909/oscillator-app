// Service Worker for Oscillator App - Background Push Notifications

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

// Handle push events (for future Web Push integration)
self.addEventListener('push', event => {
  const data = event.data?.json() ?? {}
  const title = data.title ?? 'オシレータシグナル'
  const options = {
    body: data.body ?? 'シグナルが検出されました',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: data.url ?? '/',
    vibrate: [200, 100, 200],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// Handle notification click
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      for (const client of clients) {
        if (client.url === url && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})

// Periodic background sync (if supported)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'oscillator-check') {
    event.waitUntil(checkSignals())
  }
})

async function checkSignals() {
  try {
    const res = await fetch('/api/cron', {
      headers: { Authorization: `Bearer ${self.__CRON_SECRET ?? ''}` }
    })
    const data = await res.json()
    console.log('[SW] Cron result:', data)
  } catch (e) {
    console.warn('[SW] checkSignals failed:', e)
  }
}
