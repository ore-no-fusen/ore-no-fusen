// worker/index.js
// next-pwa custom worker — push / notificationclick を sw.js に注入
// customWorkerSrc: 'worker' により next-pwa が sw.js に merge する

const SW_VERSION = '2.9.26';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  swLog(`SW起動 version=${SW_VERSION}`);
  event.waitUntil(clients.claim());
});

/** 現在時刻を日本時間（JST, +09:00）の ISO 8601 文字列で返す */
function nowJST() {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jst.toISOString().replace('Z', '+09:00');
}

/** デバッグログを IndexedDB（fusen-logs）に追記する（fire-and-forget） */
function swLog(msg) {
  swLogAsync(msg).catch(() => {});
}

/** デバッグログを IndexedDB（fusen-logs）に追記する（Promise版 - event.waitUntil 内で使用） */
function swLogAsync(msg) {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('fusen-logs', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('logs', { autoIncrement: true });
      req.onsuccess = () => {
        const tx = req.result.transaction('logs', 'readwrite');
        tx.objectStore('logs').add({ t: nowJST(), msg });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    } catch (e) {
      resolve();
    }
  });
}

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || '俺の付箋';
  const bodyPush = (data.body || '').replace(/!\[.*?\]\(.*?\)/g, '').trim();
  const bodyRich = data.body_rich || bodyPush;
  const id = data.id ?? 'unknown';
  swLog(`push受信 id=${id} title=${title}`);

  // body_rich はPushペイロードに含まれている（Driveフェッチ不要）
  // 画像ファイル（fusen_img_*）のみDriveからダウンロードして IndexedDB に保存する
  const flow = loadTokenFromMeta().then((token) => {
    swLog(`token=${token ? 'あり' : 'なし'}`);
    if (!token) return saveToIndexedDB(id, title, bodyRich, []);
    return downloadImagesFromDrive(token, bodyRich).then((images) => {
      swLog(`画像=${images.length}件`);
      return saveToIndexedDB(id, title, bodyRich, images).then(() => {
        swLog('IndexedDB保存完了');
        deleteImagesFromDrive(token, images);
        removeIdFromNotesToIphone(token, id);
      });
    }).catch((e) => {
      swLog(`画像ダウンロード失敗: ${e}`);
      return saveToIndexedDB(id, title, bodyRich, []);
    });
  }).catch((e) => {
    swLog(`token取得失敗: ${e}`);
    return saveToIndexedDB(id, title, bodyRich, []);
  }).then(() => {
    // iOS で notificationclick が発火しない場合の保険: 次回ページ起動時に自動表示
    return savePendingOpen(id);
  }).then(() => {
    // 同じノートの既存通知を閉じてから表示（重複防止）
    return self.registration.getNotifications().then((ns) => {
      ns.forEach((n) => { if (n.data?.id === id) n.close(); });
    });
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

/** 次回ページ起動時に開くノート ID を fusen-meta に保存する（Promise版） */
function savePendingOpen(id) {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('fusen-meta', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('meta');
      req.onsuccess = () => {
        const tx = req.result.transaction('meta', 'readwrite');
        tx.objectStore('meta').put({ id, t: Date.now() }, 'pending_open');
        tx.oncomplete = () => { swLogAsync(`pending_open保存 id=${id}`).then(resolve); };
        tx.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    } catch (e) { resolve(); }
  });
}

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

/** fusen-drafts IndexedDB に保存する（Blob → ArrayBuffer 変換でiOS互換） */
function saveToIndexedDB(id, title, body, images) {
  const imagePromises = (images || []).map(({ fileName, blob }) =>
    (blob && blob.arrayBuffer ? blob.arrayBuffer() : Promise.resolve(null))
      .then((ab) => ab ? { fileName, data: ab, type: blob.type || 'image/jpeg' } : null)
      .catch(() => null)
  );
  return Promise.all(imagePromises).then((processed) => {
    const validImages = processed.filter(Boolean);
    return new Promise((resolve) => {
      const req = indexedDB.open('fusen-drafts', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('drafts');
      req.onsuccess = () => {
        const tx = req.result.transaction('drafts', 'readwrite');
        tx.objectStore('drafts').put(
          { id, title, body, created_at: nowJST(), images: validImages, received_pc: true, locked: true },
          id
        );
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    });
  });
}

/** notes_to_iphone.json から指定IDを除いて更新する（fire-and-forget）
 *  配列が空になったらファイルごと削除する */
function removeIdFromNotesToIphone(token, id) {
  getAppFolderId(token).then((folderId) => {
    const folderQuery = folderId ? `+and+'${folderId}'+in+parents` : '';
    return fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='notes_to_iphone.json'${folderQuery}+and+trashed=false`,
      { headers: { Authorization: `Bearer ${token}` } }
    ).then((r) => r.json()).then((d) => {
      const fileId = d.files?.[0]?.id;
      if (!fileId) return;
      return fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } }
      ).then((r) => r.json()).then((json) => {
        const items = Array.isArray(json.items) ? json.items : [];
        const updated = items.filter((item) => item.id !== id);
        if (updated.length === items.length) return;
        if (updated.length === 0) {
          return fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`,
            { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
          );
        }
        return fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
          {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: updated }),
          }
        );
      });
    });
  }).catch((e) => swLog(`notes_to_iphone削除失敗: ${e}`));
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
  if (event.data?.type === 'CLOSE_NOTIFICATION') {
    self.registration.getNotifications({ tag: event.data.tag })
      .then((ns) => ns.forEach((n) => n.close()));
  }
  if (event.data?.type === 'GET_VERSION') {
    event.source?.postMessage({ type: 'SW_VERSION', version: SW_VERSION });
  }
});

/** IndexedDB（fusen-drafts）でノートの locked フラグを確認する */
function checkIsLocked(id) {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('fusen-drafts', 1);
      req.onsuccess = () => {
        const tx = req.result.transaction('drafts', 'readonly');
        const r = tx.objectStore('drafts').get(id);
        r.onsuccess = () => resolve(r.result?.locked === true);
        r.onerror = () => resolve(false);
      };
      req.onerror = () => resolve(false);
    } catch (e) { resolve(false); }
  });
}

self.addEventListener('notificationclick', (event) => {
  const { id, title, body } = event.notification.data || {};
  event.notification.close();
  const targetUrl = self.location.origin + '/viewer?note=' + (id ?? 'unknown');
  event.waitUntil(
    Promise.all([
      swLogAsync(`notificationclick id=${id}`),
      // 🔔ON（locked=true）なら再表示、🔔OFF（locked=false）なら再表示しない
      checkIsLocked(id).then((isLocked) => {
        swLogAsync(`notificationclick locked=${isLocked}`);
        if (!isLocked) return;
        return self.registration.showNotification(title, {
          body,
          tag: 'fusen-' + (id ?? 'unknown'),
          data: { id, title, body },
          icon: '/icon-192.png',
          badge: '/icon-192.png',
        });
      }),
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        return swLogAsync(`clients=${clientList.length}件`).then(() => {
          for (const client of clientList) {
            if (client.url.includes('/viewer') && 'focus' in client) {
              swLogAsync(`postMessage OPEN_NOTE id=${id}`);
              client.postMessage({ type: 'OPEN_NOTE', id });
              return client.focus();
            }
          }
          swLogAsync(`openWindow targetUrl=${targetUrl}`);
          return clients.openWindow(targetUrl);
        });
      }),
    ])
  );
});
