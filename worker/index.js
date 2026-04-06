// worker/index.js
// next-pwa custom worker — push / notificationclick を sw.js に注入
// customWorkerSrc: 'worker' により next-pwa が sw.js に merge する

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || '俺の付箋';
  const body = data.body || '';
  const id = data.id ?? 'unknown';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: 'fusen-' + id,
      data: { id, title, body },
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  const { id, title, body } = event.notification.data || {};
  event.notification.close();
  const targetUrl = self.location.origin + '/viewer?note=' + (id ?? 'unknown');
  event.waitUntil(
    Promise.all([
      // 通知を即復活（消す意思がないなら残り続ける）
      self.registration.showNotification(title, {
        body,
        tag: 'fusen-' + (id ?? 'unknown'),
        data: { id, title, body },
        icon: '/icon-192.png',
        badge: '/icon-192.png',
      }),
      // Viewer を開く
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes('/viewer') && 'focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        return clients.openWindow(targetUrl);
      }),
    ])
  );
});
