// worker/index.js
// next-pwa custom worker — push / notificationclick を sw.js に注入
// customWorkerSrc: 'worker' により next-pwa が sw.js に merge する

/** 現在時刻を日本時間（JST, +09:00）の ISO 8601 文字列で返す */
function nowJST() {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jst.toISOString().replace('Z', '+09:00');
}

/** デバッグログを IndexedDB（fusen-logs）に追記する */
function swLog(msg) {
  try {
    const req = indexedDB.open('fusen-logs', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('logs', { autoIncrement: true });
    req.onsuccess = () => {
      const tx = req.result.transaction('logs', 'readwrite');
      tx.objectStore('logs').add({ t: nowJST(), msg });
    };
  } catch (e) { /* ログ失敗は無視 */ }
}

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || '俺の付箋';
  const bodyPush = data.body || '';
  const id = data.id ?? 'unknown';
  swLog(`push受信 id=${id} title=${title}`);

  // Drive から body_rich と画像を取得して IndexedDB に保存してから通知を表示する（直列）
  const flow = loadTokenFromMeta().then((token) => {
    swLog(`token=${token ? 'あり' : 'なし'}`);
    if (!token) return saveToIndexedDB(id, title, bodyPush, []);
    return fetchBodyRichFromDrive(token, id).then((richBody) => {
      swLog(`body_rich=${richBody ? '取得成功' : 'なし'}`);
      const body = richBody || bodyPush;
      return downloadImagesFromDrive(token, body).then((images) => {
        swLog(`画像=${images.length}件`);
        return saveToIndexedDB(id, title, body, images).then(() => {
          swLog('IndexedDB保存完了');
          deleteImagesFromDrive(token, images);
        });
      });
    }).catch((e) => {
      swLog(`Drive取得失敗: ${e}`);
      return saveToIndexedDB(id, title, bodyPush, []);
    });
  }).catch((e) => {
    swLog(`token取得失敗: ${e}`);
    return saveToIndexedDB(id, title, bodyPush, []);
  }).then(() => {
    swLog('通知表示');
    return self.registration.showNotification(title, {
      body: bodyPush,
      tag: 'fusen-' + id,
      data: { id, title, body: bodyPush },
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    });
  });

  event.waitUntil(flow);
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
  return getAppFolderId(token).then((folderId) => {
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

/** ore-no-fusen フォルダの ID を取得する */
function getAppFolderId(token) {
  return fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='ore-no-fusen'+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false`,
    { headers: { Authorization: `Bearer ${token}` } }
  ).then((r) => r.json()).then((d) => d.files?.[0]?.id ?? null).catch(() => null);
}

/** body 内の fusen_img_* をすべて Drive からダウンロードして Blob 配列で返す */
function downloadImagesFromDrive(token, body) {
  const re = /!\[[^\]]*\]\((fusen_img_[^)]+)\)/g;
  const fileNames = [];
  let m;
  while ((m = re.exec(body)) !== null) fileNames.push(m[1]);
  if (fileNames.length === 0) return Promise.resolve([]);
  return getAppFolderId(token).then((folderId) => {
    const folderQuery = folderId ? `+and+'${folderId}'+in+parents` : '';
    return Promise.all(fileNames.map((fileName) =>
      fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${fileName}'${folderQuery}+and+trashed=false`,
        { headers: { Authorization: `Bearer ${token}` } }
      ).then((r) => r.json())
        .then((d) => {
          const fileId = d.files?.[0]?.id;
          if (!fileId) return null;
          return fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            { headers: { Authorization: `Bearer ${token}` } }
          ).then((r) => r.blob()).then((blob) => ({ fileName, blob })).catch(() => null);
        }).catch(() => null)
    ));
  }).then((results) => results.filter(Boolean)).catch(() => []);
}

/** fusen-drafts IndexedDB に保存する */
function saveToIndexedDB(id, title, body, images) {
  return new Promise((resolve) => {
    const req = indexedDB.open('fusen-drafts', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('drafts');
    req.onsuccess = () => {
      const tx = req.result.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').put(
        { id, title, body, created_at: nowJST(), images: images ?? [], received_pc: true, locked: true },
        id
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    };
    req.onerror = () => resolve();
  });
}

/** IndexedDB 保存済みの fusen_img_* を Drive から削除する（fire-and-forget） */
function deleteImagesFromDrive(token, images) {
  if (!images || images.length === 0) return;
  getAppFolderId(token).then((folderId) => {
    const folderQuery = folderId ? `+and+'${folderId}'+in+parents` : '';
    for (const { fileName } of images) {
      fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${fileName}'${folderQuery}+and+trashed=false`,
        { headers: { Authorization: `Bearer ${token}` } }
      ).then((r) => r.json()).then((d) => {
        const fileId = d.files?.[0]?.id;
        if (fileId) {
          fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`,
            { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
          ).catch(() => {});
        }
      }).catch(() => {});
    }
  }).catch(() => {});
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
