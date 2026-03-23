// worker/index.js
// next-pwa custom worker — push / notificationclick を sw.js に注入
// customWorkerSrc: 'worker' により next-pwa が sw.js に merge する

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || '俺の付箋', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: self.location.origin + '/viewer' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/viewer') && 'focus' in client) {
          return client.focus();
        }
      }
      // iOS Safari では相対パスが動かないケースがあるため絶対 URL を使用
      return clients.openWindow(self.location.origin + '/viewer');
    })
  );
});
