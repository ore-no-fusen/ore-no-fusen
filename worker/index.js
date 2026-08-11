// worker/index.js
// next-pwa custom worker — push / notificationclick を sw.js に注入
// customWorkerSrc: 'worker' により next-pwa が sw.js に merge する

import { resolvePushTitles } from './notification-title';
import { closeClickedNotification, focusViewerOrOpenTarget } from './notification-click';

const SW_VERSION = '5.1.4-pwa.5';

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
  const id = data.id ?? 'unknown';
  swLog(`push受信 id=${id} drive_fetch=${data.fetch_from_drive === true}`);

  const flow = loadTokenFromMeta().then(async (token) => {
    swLog(`token=${token ? 'あり' : 'なし'}`);
    let resolvedData = data;
    let driveFetchSucceeded = data.fetch_from_drive !== true;

    if (data.fetch_from_drive === true && token) {
      const driveNote = await downloadNoteFromDrive(token, id);
      if (driveNote) {
        resolvedData = { ...data, ...driveNote };
        driveFetchSucceeded = true;
        swLog(`Drive本文取得完了 id=${id}`);
      } else {
        swLog(`Drive本文取得失敗 id=${id}`);
      }
    }

    const { noteTitle, notificationTitle } = resolvePushTitles(
      resolvedData.title,
      self.navigator?.language
    );
    const bodyRich = resolvedData.body_rich || resolvedData.body || '';
    const bodyPush = bodyRich.replace(/!\[.*?\]\(.*?\)/g, '').trim();

    if (!token) {
      await saveToIndexedDB(id, noteTitle, bodyRich, []);
    } else {
      try {
        const expectedImages = extractImageFileNames(bodyRich);
        const images = await downloadImagesFromDrive(token, bodyRich);
        swLog(`画像=${images.length}/${expectedImages.length}件`);
        await saveToIndexedDB(id, noteTitle, bodyRich, images);
        swLog('IndexedDB保存完了');
        if (driveFetchSucceeded && images.length === expectedImages.length) {
          deleteImagesFromDrive(token, images);
          await removeIdFromNotesToIphone(token, id);
        } else {
          swLog('本文または画像不足のためDriveキューを保持');
        }
      } catch (e) {
        swLog(`画像ダウンロード失敗: ${e}`);
        await saveToIndexedDB(id, noteTitle, bodyRich, []);
      }
    }

    // iOS で notificationclick が発火しない場合の保険: 次回ページ起動時に自動表示
    await savePendingOpen(id);
    // 同じノートの既存通知を閉じてから表示（重複防止）
    const notifications = await self.registration.getNotifications();
    notifications.forEach((n) => { if (n.data?.id === id) n.close(); });
    swLog(`[NAV] event=notification_shown id=${id}`);
    return self.registration.showNotification(notificationTitle, {
      body: bodyPush,
      tag: 'fusen-' + id,
      data: { id, title: notificationTitle, body: bodyPush },
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    });
  }).catch((e) => {
    swLog(`push処理失敗: ${e}`);
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
        tx.oncomplete = () => {
          swLogAsync(`[NAV] event=pending_saved id=${id}`).then(resolve);
        };
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

/** notes_to_iphone.json から指定IDの長文ノートを取得する */
function downloadNoteFromDrive(token, id) {
  return getAppFolderId(token).then((folderId) => {
    const folderQuery = folderId ? `+and+'${folderId}'+in+parents` : '';
    return fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='notes_to_iphone.json'${folderQuery}+and+trashed=false`,
      { headers: { Authorization: `Bearer ${token}` } }
    ).then((r) => r.json()).then((d) => {
      const fileId = d.files?.[0]?.id;
      if (!fileId) return null;
      return fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } }
      ).then((r) => r.json()).then((json) => {
        const items = Array.isArray(json.items) ? json.items : [];
        return items.find((item) => item.id === id) ?? null;
      });
    });
  }).catch(() => null);
}

function extractImageFileNames(body) {
  const re = /!\[[^\]]*\]\((fusen_img_[^)]+)\)/g;
  const fileNames = [];
  let m;
  while ((m = re.exec(body)) !== null) fileNames.push(m[1]);
  return fileNames;
}

/** body 内の fusen_img_* をすべて Drive からダウンロードして Blob 配列で返す */
function downloadImagesFromDrive(token, body) {
  const fileNames = extractImageFileNames(body);
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

function mergeImagesForBody(body, existingImages, newImages) {
  const expectedNames = extractImageFileNames(body);
  const existingByName = new Map((existingImages || []).filter((img) => img?.fileName).map((img) => [img.fileName, img]));
  const newByName = new Map((newImages || []).filter((img) => img?.fileName).map((img) => [img.fileName, img]));
  if (expectedNames.length === 0) return newImages || [];
  return expectedNames
    .map((fileName) => newByName.get(fileName) || existingByName.get(fileName))
    .filter(Boolean);
}

/** fusen-drafts IndexedDB に保存する（Blob → ArrayBuffer 変換でiOS互換） */
function saveToIndexedDB(id, title, body, images) {
  const imagePromises = (images || []).map(({ fileName, blob }) =>
    (blob && blob.arrayBuffer ? blob.arrayBuffer() : Promise.resolve(null))
      .then((ab) => ab ? { fileName, data: ab, type: blob.type || 'image/jpeg' } : null)
  );
  return Promise.all(imagePromises).then((processed) => {
    const validImages = processed.filter(Boolean);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('fusen-drafts', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('drafts');
      req.onsuccess = () => {
        const tx = req.result.transaction('drafts', 'readwrite');
        const store = tx.objectStore('drafts');
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const existing = getReq.result;
          store.put(
            {
              ...existing,
              id,
              title,
              body,
              created_at: existing?.created_at || nowJST(),
              images: mergeImagesForBody(body, existing?.images, validImages),
              received_pc: true,
              locked: true,
            },
            id
          );
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error('IndexedDB transaction failed'));
      };
      req.onerror = () => reject(new Error('IndexedDB open failed'));
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
  const { id, title, body } = closeClickedNotification(event.notification);
  event.waitUntil(
    Promise.all([
      swLogAsync(`[NAV] event=notification_click id=${id}`),
      // 🔔ON（locked=true）なら再表示、🔔OFF（locked=false）なら再表示しない
      checkIsLocked(id).then((isLocked) => {
        swLogAsync(`[NAV] event=notification_lock_checked id=${id} locked=${isLocked}`);
        if (!isLocked) return;
        return self.registration.showNotification(title, {
          body,
          tag: 'fusen-' + (id ?? 'unknown'),
          data: { id, title, body },
          icon: '/icon-192.png',
          badge: '/icon-192.png',
        });
      }),
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) =>
        swLogAsync(`[NAV] event=client_count id=${id} count=${clientList.length}`).then(() =>
          focusViewerOrOpenTarget({
            clientList,
            id,
            origin: self.location.origin,
            openWindow: (url) => clients.openWindow(url),
            log: (message) => { swLogAsync(message); },
          })
        )
      ),
    ])
  );
});
