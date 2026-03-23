/**
 * Google Drive ラッパー
 *
 * OAuth2 + upsert + read の基盤機能を提供する。
 * APIハンドラ（Plan 04）が依存する Google Drive 操作の基盤。
 */

import { google } from 'googleapis';

// ---------------------------------------------------------------------------
// OAuth2 クライアント
// ---------------------------------------------------------------------------

export function getOAuth2Client() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error('OAUTH_NOT_CONFIGURED');
  }
  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return auth;
}

// ---------------------------------------------------------------------------
// invalid_grant ラッパー
// ---------------------------------------------------------------------------

async function withDriveAuth<T>(fn: (drive: ReturnType<typeof google.drive>) => Promise<T>): Promise<T> {
  try {
    const auth = getOAuth2Client();
    const drive = google.drive({ version: 'v3', auth });
    return await fn(drive);
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } }; message?: string };
    if (
      e?.response?.data?.error === 'invalid_grant' ||
      e?.message?.includes('invalid_grant')
    ) {
      throw new Error('OAUTH_REFRESH_TOKEN_EXPIRED');
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// フォルダ確保
// ---------------------------------------------------------------------------

async function ensureFolder(drive: ReturnType<typeof google.drive>): Promise<string> {
  // GOOGLE_DRIVE_FOLDER_ID が設定されていれば直接使用
  const envFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (envFolderId) return envFolderId;

  const folderName = 'ore-no-fusen';
  const list = await drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });
  if (list.data.files?.[0]?.id) return list.data.files[0].id;

  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });
  return created.data.id!;
}

// ---------------------------------------------------------------------------
// JSON ファイル upsert
// ---------------------------------------------------------------------------

export async function upsertJsonFile(filename: string, data: object): Promise<void> {
  await withDriveAuth(async (drive) => {
    const folderId = await ensureFolder(drive);
    const json = JSON.stringify(data);
    const media = { mimeType: 'application/json', body: json };

    const list = await drive.files.list({
      q: `name='${filename}' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id)',
      spaces: 'drive',
    });
    const existing = list.data.files?.[0];

    if (existing?.id) {
      await drive.files.update({ fileId: existing.id, media });
    } else {
      await drive.files.create({
        requestBody: { name: filename, parents: [folderId] },
        media,
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function savePushSubscription(
  sub: { endpoint: string; keys?: { p256dh: string; auth: string }; p256dh?: string; auth?: string }
): Promise<void> {
  await upsertJsonFile('fusen_push_config.json', sub);
}

export async function saveNote(note: object): Promise<void> {
  await upsertJsonFile('fusen_note.json', note);
}

export async function getLatestNote(): Promise<object | null> {
  return withDriveAuth(async (drive) => {
    const folderId = await ensureFolder(drive);

    const list = await drive.files.list({
      q: `name='fusen_note.json' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });
    const file = list.data.files?.[0];
    if (!file?.id) return null;

    const res = await drive.files.get(
      { fileId: file.id, alt: 'media' },
      { responseType: 'text' }
    );
    return JSON.parse(res.data as string) as object;
  });
}
