// app/viewer/lib/drive.ts
// Google Drive API 操作関数。'use client' / import React は不要。
// refreshAccessToken は localStorage を使うためブラウザ環境前提。

export const APP_FOLDER_NAME = 'ore-no-fusen';
let cachedFolderId: string | null = null;

/**
 * 責務: モジュールレベルのフォルダ ID キャッシュをリセットする（テスト用）
 * 入力: なし
 * 出力: なし
 * 副作用: cachedFolderId モジュール変数を null に書き込む
 */
export function resetCachedFolderId() {
  cachedFolderId = null;
}


// 旧ファイル名 → 新ファイル名の移行マップ
const LEGACY_FILE_NAMES: Record<string, string> = {
  'notes_to_iphone.json': 'notes_to_iphone.json',
  'push_devices.json': 'push_devices.json',
  'pc_devices.json': 'pc_devices.json',
  'notes_from_iphone.json': 'notes_from_iphone.json',
};

/**
 * 責務: ore-no-fusen フォルダの Drive ファイル ID を取得する（なければ作成してキャッシュ）
 * 入力: accessToken: string
 * 出力: Promise<string | null>（エラー時は null）
 * 副作用: Google Drive API 呼び出し、cachedFolderId モジュール変数を更新する
 */
export async function getAppFolderId(accessToken: string): Promise<string | null> {
  if (cachedFolderId !== null) return cachedFolderId;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${APP_FOLDER_NAME}'+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  if (data.files?.[0]?.id) {
    cachedFolderId = data.files[0].id as string;
    return cachedFolderId;
  }
  if (data.error) {
    console.warn('[Drive] folder search error:', data.error.message);
    return null;
  }
  // フォルダが存在しない場合は作成
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: APP_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder', parents: ['root'] }),
  });
  const created = await createRes.json();
  if (created.error) {
    console.warn('[Drive] folder create error:', created.error.message);
    return null;
  }
  cachedFolderId = created.id as string;
  return cachedFolderId;
}

/**
 * 責務: JSON オブジェクトを Drive の指定ファイル名で保存する（存在すれば上書き、なければ新規作成）
 * 入力: accessToken: string, fileName: string, data: object
 * 出力: Promise<void>
 * 副作用: Google Drive API 呼び出し（PATCH または POST）
 */
export async function uploadToDrive(
  accessToken: string,
  fileName: string,
  data: object
) {
  const folderId = await getAppFolderId(accessToken);
  const parentId = folderId ?? 'root';
  const folderQuery = folderId ? `+and+'${folderId}'+in+parents` : '';
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${fileName}'${folderQuery}+and+trashed=false`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const searchData = await searchRes.json();
  const fileId = searchData.files?.[0]?.id;
  const body = JSON.stringify(data);
  const fileBlob = new Blob([body], { type: 'application/json' });
  if (fileId) {
    const updateMeta = JSON.stringify({ name: fileName, mimeType: 'application/json' });
    const form = new FormData();
    form.append('metadata', new Blob([updateMeta], { type: 'application/json' }));
    form.append('file', fileBlob);
    const patchRes = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      }
    );
    if (!patchRes.ok) throw new Error(`Drive PATCH failed: ${patchRes.status}`);
  } else {
    const createMeta = JSON.stringify({ name: fileName, mimeType: 'application/json', parents: [parentId] });
    const form = new FormData();
    form.append('metadata', new Blob([createMeta], { type: 'application/json' }));
    form.append('file', fileBlob);
    const postRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      }
    );
    if (!postRes.ok) throw new Error(`Drive POST failed: ${postRes.status}`);
  }
}

/**
 * 責務: Drive から指定ファイルを JSON としてダウンロードする（旧ファイル名への自動フォールバックあり）
 * 入力: accessToken: string, fileName: string
 * 出力: Promise<unknown>（JSON パース済みオブジェクト）
 * 副作用: Google Drive API 呼び出し、旧名ファイルが見つかった場合は新名への移行アップロードをバックグラウンドで行う
 */
export async function downloadFromDrive(accessToken: string, fileName: string) {
  const folderId = await getAppFolderId(accessToken);
  const folderQuery = folderId ? `+and+'${folderId}'+in+parents` : '';
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${fileName}'${folderQuery}+and+trashed=false`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const searchData = await searchRes.json();
  let fileId = searchData.files?.[0]?.id;

  // 新ファイル名で見つからなければ旧ファイル名にフォールバック（移行対応）
  if (!fileId && LEGACY_FILE_NAMES[fileName]) {
    const legacyName = LEGACY_FILE_NAMES[fileName];
    const legacyRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${legacyName}'${folderQuery}+and+trashed=false`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const legacyData = await legacyRes.json();
    fileId = legacyData.files?.[0]?.id;
    if (fileId) {
      const content = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      ).then(r => r.json());
      // 新名に移行（バックグラウンド・失敗しても無視）
      uploadToDrive(accessToken, fileName, content).catch(() => {});
      return content;
    }
  }

  if (!fileId) throw new Error(`${fileName} not found in Drive`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  return res.json();
}

// ---------------------------------------------------------------------------
// リフレッシュトークンでアクセストークンを更新する
// ---------------------------------------------------------------------------

/**
 * 責務: リフレッシュトークンを使ってアクセストークンを更新する
 * 入力: なし
 * 出力: Promise<string | null>（失敗またはリフレッシュトークンなしの場合は null）
 * 副作用: localStorage 読み取り（viewer_refresh_token）・書き込み（viewer_access_token, viewer_expires_at）、/api/auth/refresh を呼び出す
 */
export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('viewer_refresh_token');
  if (!refreshToken) return null;

  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!res.ok) {
    localStorage.removeItem('viewer_refresh_token');
    return null;
  }

  const data = await res.json();
  const newToken = data.access_token;
  if (!newToken) return null;

  localStorage.setItem('viewer_access_token', newToken);
  if (data.expires_in) {
    localStorage.setItem('viewer_expires_at', String(Date.now() + data.expires_in * 1000));
  }
  // SW が push 時に参照するため IndexedDB にも保存
  try {
    const req = indexedDB.open('fusen-meta', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('meta');
    req.onsuccess = () => {
      const tx = req.result.transaction('meta', 'readwrite');
      tx.objectStore('meta').put(newToken, 'access_token');
    };
  } catch { /* 無視 */ }
  return newToken;
}

/**
 * 責務: JSON を Drive にアップロードする（トークン期限切れ時に自動リフレッシュ）
 * 入力: token: string, fileName: string, data: object
 * 出力: Promise<void>
 * 副作用: Google Drive API 呼び出し、期限切れ時に refreshAccessToken を呼び出す
 */
export async function uploadWithAutoRefresh(
  token: string,
  fileName: string,
  data: object
): Promise<void> {
  try {
    await uploadToDrive(token, fileName, data);
  } catch {
    const newToken = await refreshAccessToken();
    if (!newToken) throw new Error('session expired');
    await uploadToDrive(newToken, fileName, data);
  }
}

/**
 * 責務: 画像 Blob を Google Drive にアップロードする（multipart）
 * 入力: accessToken: string, file: Blob, fileName: string
 * 出力: Promise<void>
 * 副作用: Google Drive API 呼び出し（POST multipart）
 */
export async function uploadImageToDrive(
  accessToken: string,
  file: Blob,
  fileName: string
): Promise<void> {
  const folderId = await getAppFolderId(accessToken);
  const parentId = folderId ?? 'root';
  const metadata = JSON.stringify({
    name: fileName,
    mimeType: file.type || 'image/jpeg',
    parents: [parentId],
  });
  const form = new FormData();
  form.append('metadata', new Blob([metadata], { type: 'application/json' }));
  form.append('file', file);
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    }
  );
  if (!res.ok) throw new Error(`Drive image upload failed: ${res.status}`);
}

/**
 * 責務: 動画 Blob を Google Drive にアップロードする（multipart）
 * 入力: accessToken: string, file: Blob, fileName: string
 * 出力: Promise<void>
 * 副作用: Google Drive API 呼び出し（POST multipart）
 */
export async function uploadVideoToDrive(
  accessToken: string,
  file: Blob,
  fileName: string
): Promise<void> {
  const folderId = await getAppFolderId(accessToken);
  const parentId = folderId ?? 'root';
  const metadata = JSON.stringify({
    name: fileName,
    mimeType: file.type || 'video/mp4',
    parents: [parentId],
  });
  const form = new FormData();
  form.append('metadata', new Blob([metadata], { type: 'application/json' }));
  form.append('file', file);
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    }
  );
  if (!res.ok) throw new Error(`Drive video upload failed: ${res.status}`);
}

/**
 * 責務: Drive からファイルをダウンロードする（トークン期限切れ時に自動リフレッシュ）
 * 入力: token: string, fileName: string
 * 出力: Promise<unknown>（JSON パース済みオブジェクト）
 * 副作用: Google Drive API 呼び出し、期限切れ時に refreshAccessToken を呼び出す
 */
export async function downloadWithAutoRefresh(
  token: string,
  fileName: string
): Promise<unknown> {
  try {
    return await downloadFromDrive(token, fileName);
  } catch {
    const newToken = await refreshAccessToken();
    if (!newToken) throw new Error('session expired');
    return await downloadFromDrive(newToken, fileName);
  }
}

/**
 * 責務: 画像を Drive にアップロードする（トークン期限切れ時に自動リフレッシュ）
 * 入力: token: string, file: Blob, fileName: string
 * 出力: Promise<void>
 * 副作用: Google Drive API 呼び出し、期限切れ時に refreshAccessToken を呼び出す
 */
export async function uploadImageWithAutoRefresh(
  token: string,
  file: Blob,
  fileName: string
): Promise<void> {
  try {
    await uploadImageToDrive(token, file, fileName);
  } catch {
    const newToken = await refreshAccessToken();
    if (!newToken) throw new Error('session expired');
    await uploadImageToDrive(newToken, file, fileName);
  }
}

/**
 * 責務: 動画を Drive にアップロードする（トークン期限切れ時に自動リフレッシュ）
 * 入力: token: string, file: Blob, fileName: string
 * 出力: Promise<void>
 * 副作用: Google Drive API 呼び出し、期限切れ時に refreshAccessToken を呼び出す
 */
export async function uploadVideoWithAutoRefresh(
  token: string,
  file: Blob,
  fileName: string
): Promise<void> {
  try {
    await uploadVideoToDrive(token, file, fileName);
  } catch {
    const newToken = await refreshAccessToken();
    if (!newToken) throw new Error('session expired');
    await uploadVideoToDrive(newToken, file, fileName);
  }
}

/**
 * 責務: Drive からバイナリファイル（画像）を Blob としてダウンロードする
 */
async function downloadBinaryFromDrive(accessToken: string, fileName: string): Promise<Blob> {
  const folderId = await getAppFolderId(accessToken);
  const folderQuery = folderId ? `+and+'${folderId}'+in+parents` : '';
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${fileName}'${folderQuery}+and+trashed=false`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const searchData = await searchRes.json();
  const fileId = searchData.files?.[0]?.id;
  if (!fileId) throw new Error(`${fileName} not found in Drive`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return res.blob();
}

export async function downloadBinaryWithAutoRefresh(token: string, fileName: string): Promise<Blob> {
  try {
    return await downloadBinaryFromDrive(token, fileName);
  } catch {
    const newToken = await refreshAccessToken();
    if (!newToken) throw new Error('session expired');
    return await downloadBinaryFromDrive(newToken, fileName);
  }
}

async function deleteFileFromDriveInternal(accessToken: string, fileName: string): Promise<void> {
  const folderId = await getAppFolderId(accessToken);
  const folderQuery = folderId ? `+and+'${folderId}'+in+parents` : '';
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${fileName}'${folderQuery}+and+trashed=false`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const searchData = await searchRes.json();
  const fileId = searchData.files?.[0]?.id;
  if (!fileId) return;
  const deleteRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!deleteRes.ok && deleteRes.status !== 404) {
    throw new Error(`Drive DELETE failed: ${deleteRes.status}`);
  }
}

export async function deleteFileFromDrive(accessToken: string, fileName: string): Promise<void> {
  try {
    await deleteFileFromDriveInternal(accessToken, fileName);
  } catch {
    const newToken = await refreshAccessToken();
    if (!newToken) return;
    await deleteFileFromDriveInternal(newToken, fileName);
  }
}
