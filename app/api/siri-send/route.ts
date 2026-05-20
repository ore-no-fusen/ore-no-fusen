import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// /api/siri-send
//
// ★ 裏機能・実験的・開発者向け ★
// 一般ユーザー向け機能ではない。本番リリース・ユーザーガイドに含めない。
// 開発者が iPhone のショートカット App から手動で叩いて、Siri 連携を実験する用途。
//
// PWA の DebugLogView (?debug=1) 内の「Siri 用トークンをコピー」で取得した
// refresh_token を、ショートカット App 内に貼り付けて使う。
//
// 入力 (GET クエリ):
//   text          : 送信するテキスト（必須）
//   refresh_token : ユーザーの Google OAuth リフレッシュトークン（必須）
//
// 動作:
//   1. refresh_token から access_token を取得（既存 /api/auth/refresh と同じ手順）
//   2. Drive の ore-no-fusen フォルダを探す（なければ作る）
//   3. notes_from_iphone.json を取得（なければ空配列で開始）
//   4. 新規アイテムを items 配列に append（id, title, body, sent_at, tags:['siri']）
//   5. Drive に書き戻す
//   6. JSON で結果を返す
//
// PC 側はこれを 30 秒間隔のポーリング (src-tauri/src/lib.rs:poll_iphone_note)
// で検出して付箋ウィンドウを立ち上げる。
//
// プライバシー上の注意:
//   GET クエリに refresh_token と text が含まれるため、Vercel のアクセスログに
//   短期間（Hobby プランで約 1 時間）残る。一般ユーザーには案内しない裏機能とする。
// ---------------------------------------------------------------------------

const APP_FOLDER_NAME = 'ore-no-fusen';
const NOTES_FILE_NAME = 'notes_from_iphone.json';

function nowJST(): string {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jst.toISOString().replace('Z', '+09:00');
}

async function exchangeRefreshTokenForAccessToken(refreshToken: string): Promise<string> {
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: process.env.NEXT_PUBLIC_GDRIVE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET_PWA!,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`refresh_token exchange failed: ${res.status} ${errText}`);
  }
  const data = await res.json();
  if (!data.access_token) throw new Error('access_token missing in OAuth response');
  return data.access_token as string;
}

async function getOrCreateAppFolderId(accessToken: string): Promise<string> {
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${APP_FOLDER_NAME}'+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const searchData = await searchRes.json();
  if (searchData.files?.[0]?.id) return searchData.files[0].id as string;
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: APP_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder', parents: ['root'] }),
  });
  const createData = await createRes.json();
  if (!createData.id) throw new Error('failed to create app folder');
  return createData.id as string;
}

async function downloadNotesJson(accessToken: string, folderId: string): Promise<{ items: unknown[] } | null> {
  const folderQuery = `+and+'${folderId}'+in+parents`;
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${NOTES_FILE_NAME}'${folderQuery}+and+trashed=false`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const searchData = await searchRes.json();
  const fileId = searchData.files?.[0]?.id;
  if (!fileId) return null;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return null;
  return res.json();
}

async function uploadNotesJson(accessToken: string, folderId: string, data: object): Promise<void> {
  const folderQuery = `+and+'${folderId}'+in+parents`;
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${NOTES_FILE_NAME}'${folderQuery}+and+trashed=false`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const searchData = await searchRes.json();
  const fileId = searchData.files?.[0]?.id;
  const body = JSON.stringify(data);
  const fileBlob = new Blob([body], { type: 'application/json' });
  if (fileId) {
    const updateMeta = JSON.stringify({ name: NOTES_FILE_NAME, mimeType: 'application/json' });
    const form = new FormData();
    form.append('metadata', new Blob([updateMeta], { type: 'application/json' }));
    form.append('file', fileBlob);
    const patchRes = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`,
      { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}` }, body: form }
    );
    if (!patchRes.ok) throw new Error(`Drive PATCH failed: ${patchRes.status}`);
  } else {
    const createMeta = JSON.stringify({ name: NOTES_FILE_NAME, mimeType: 'application/json', parents: [folderId] });
    const form = new FormData();
    form.append('metadata', new Blob([createMeta], { type: 'application/json' }));
    form.append('file', fileBlob);
    const postRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form }
    );
    if (!postRes.ok) throw new Error(`Drive POST failed: ${postRes.status}`);
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const text = url.searchParams.get('text');
  const refreshToken = url.searchParams.get('refresh_token');

  if (!text || !text.trim()) {
    return NextResponse.json({ ok: false, error: 'text is required' }, { status: 400 });
  }
  if (!refreshToken) {
    return NextResponse.json({ ok: false, error: 'refresh_token is required' }, { status: 400 });
  }

  try {
    const accessToken = await exchangeRefreshTokenForAccessToken(refreshToken);
    const folderId = await getOrCreateAppFolderId(accessToken);
    const existing = await downloadNotesJson(accessToken, folderId);

    const currentItems: unknown[] =
      existing && Array.isArray((existing as { items?: unknown[] }).items)
        ? (existing as { items: unknown[] }).items
        : [];

    const newItem = {
      id: crypto.randomUUID(),
      title: text,
      body: '',
      sent_at: nowJST(),
      tags: ['siri'],
    };
    const updatedItems = [...currentItems, newItem];
    await uploadNotesJson(accessToken, folderId, { items: updatedItems });

    return NextResponse.json({ ok: true, id: newItem.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
