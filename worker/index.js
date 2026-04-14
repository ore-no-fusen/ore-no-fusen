// worker/index.js
// next-pwa custom worker — push / notificationclick を sw.js に注入
// customWorkerSrc: 'worker' により next-pwa が sw.js に merge する

/** 現在時刻を日本時間（JST, +09:00）の ISO 8601 文字列で返す */
function nowJST() {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jst.toISOString().replace('Z', '+09:00');
}

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || '俺の付箋';
  const bodyPush = data.body || '';
  const id = data.id ?? 'unknown';

  // Drive から body_rich を取得して IndexedDB に保存する
  const saveRich = loadTokenFromMeta().then((token) => {
    if (!token) return saveToIndexedDB(id, title, bodyPush);
    return fetchBodyRichFromDrive(token, id)
      .then((richBody) => saveToIndexedDB(id, title, richBody || bodyPush))
      .catch(() => saveToIndexedDB(id, title, bodyPush));
  }).catch(() => saveToIndexedDB(id, title, bodyPush));

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: bodyPush,
        tag: 'fusen-' + id,
        data: { id, title, body: bodyPush },
        icon: '/icon-192.png',
        badge: '/icon-192.png',
      }),
      saveRich,
    ])
  );
});

/** fusen-meta DB からアクセストークンを取得する */
function loadTokenFromMeta() {
  return new Promise((resolve) => {
    const req = indexedDB.open('fusen-meta', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('meta');
    req.onsuccess = () => {
      const tx = req.result.transaction('meta', 'readonly');
      const r = tx.objectStore('meta').get('access_token');
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror = () => resolve(null);
    };
    req.onerror = () => resolve(null);
  });
}

/** Drive の notes_to_iphone.json から指定 id の body_rich を取得する */
function fetchBodyRichFromDrive(token, noteId) {
  // まず ore-no-fusen フォルダを探す
  return fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='ore-no-fusen'+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false`,
    { headers: { Authorization: `Bearer ${token}` } }
  ).then((r) => r.json()).then((folderData) => {
    const folderId = folderData.files?.[0]?.id;
    const folderQuery = folderId ? `+and+'${folderId}'+in+parents` : '';
    return fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='notes_to_iphone.json'${folderQuery}+and+trashed=false`,
      { headers: { Authorization: `Bearer ${token}` } }
    ).then((r) => r.json());
  }).then((searchData) => {
    const fileId = searchData.files?.[0]?.id;
    if (!fileId) return null;
    return fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    ).then((r) => r.json());
  }).then((driveData) => {
    const items = driveData?.items ?? [];
    const item = items.find((i) => i.id === noteId);
    return item?.body ?? null;
  });
}

/** fusen-drafts IndexedDB に保存する */
function saveToIndexedDB(id, title, body) {
  return new Promise((resolve) => {
    const req = indexedDB.open('fusen-drafts', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('drafts');
    req.onsuccess = () => {
      const tx = req.result.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').put(
        { id, title, body, created_at: nowJST(), images: [], received_pc: true },
        id
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    };
    req.onerror = () => resolve();
  });
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_NOTIFICATIONS') {
    self.registration.getNotifications().then((ns) => {
      const ids = ns.map((n) => n.tag.replace('fusen-', ''));
      event.ports[0].postMessage({ ids });
    });
  }
  if (event.data?.type === 'CLOSE_NOTIFICATION') {
    self.registration.getNotifications({ tag: event.data.tag })
      .then((ns) => ns.forEach((n) => n.close()));
  }
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
