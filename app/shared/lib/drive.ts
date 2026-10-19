'use client';

import { refreshAccessToken } from '@/app/viewer/lib/drive';
import {
  validateShareLogJson,
  parseShareOperation,
  type ShareOperation,
  type ShareScope,
} from '@/lib/web-share-contract';
import { calculateSharePayloadHash } from '@/lib/web-share-payload-hash';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const SHARE_FOLDER = 'web-share-temp';
const ROOT_FOLDER = 'ore-no-fusen';
let latestAccessToken = '';

export type SharedNote = { scope: ShareScope; operation: ShareOperation; heads: string[] };
export type WebCreateRequest = { schemaVersion: 1; accountSubject: string; targetPcId: string; noteId: string; markdown: string };
export type WebReceiver = { pcId: string; name: string };

export async function webReceivers(token: string): Promise<{ account: string; pcs: WebReceiver[] }> {
  latestAccessToken = token;
  const account = await connectedAccount(token);
  const folder = await shareFolder(token, false, account);
  if (!folder) return { account, pcs: [] };
  const files = await listAll(token, folder, account);
  const pcs = new Map<string, WebReceiver>();
  for (const file of files.filter(f => /^web-pc-[0-9a-f-]{36}\.json$/.test(f.name))) {
    const value = await downloadJson<{schemaVersion: number; accountSubject: string; pcId: string; name: string}>(token, file.id, account);
    if (value.schemaVersion === 1 && value.accountSubject === account && file.name === `web-pc-${value.pcId}.json` && typeof value.name === 'string') pcs.set(value.pcId, {pcId:value.pcId,name:value.name});
  }
  return {account, pcs:[...pcs.values()]};
}

export async function submitWebCreate(token: string, request: WebCreateRequest): Promise<void> {
  latestAccessToken = token;
  const {account,pcs} = await webReceivers(token);
  if (account !== request.accountSubject || !pcs.some(pc=>pc.pcId===request.targetPcId)) throw new Error('受取PCまたはGoogleアカウントが変わりました。保存を中止しました。');
  if (!/^[0-9a-f-]{36}$/.test(request.noteId) || !request.markdown.trim() || new TextEncoder().encode(request.markdown).length > 100_000 || /!\[|ore-fusen-image:/.test(request.markdown)) throw new Error('新規付箋は文字のみ・100KB以内で入力してください。');
  const folder=await shareFolder(token,true,account);
  if(!folder) throw new Error('先にWindowsで「Webと同期」を実行してください。');
  const name=`web-request-${request.noteId}.json`;
  const existing=(await listAll(token,folder,account)).filter(f=>f.name===name);
  for(const file of existing) {
    const prior=await downloadJson<WebCreateRequest>(token,file.id,account);
    if (Object.keys(request).some(key=>prior[key as keyof WebCreateRequest]!==request[key as keyof WebCreateRequest])) throw new Error('同じ作成IDの内容が異なります。上書きせず保存を中止しました。');
  }
  if(existing.length) return;
  const form=new FormData();
  form.append('metadata',new Blob([JSON.stringify({name,parents:[folder]})],{type:'application/json'}));
  form.append('file',new Blob([JSON.stringify(request)],{type:'application/json'}),name);
  await authorizedFetch(token,UPLOAD,{method:'POST',body:form},account);
}

export async function revokeWebNote(token:string,current:SharedNote):Promise<void> {
  latestAccessToken=token;
  const expected=current.scope.accountSubject;
  const loaded=await loadSharedNotes(token,expected);
  const latest=loaded.notes.find(n=>n.scope.noteId===current.scope.noteId && n.scope.generation===current.scope.generation);
  if(!latest) return; // Includes a successful revoke whose response was lost.
  if(latest.heads.length!==1 || latest.operation.operationId!==current.operation.operationId) throw new Error('別の端末で変更されています。Webを更新してから共有を解除してください。');
  const operation:ShareOperation={...current.operation,kind:'revoke',parents:[current.operation.operationId],resolvedIds:[],operationId:`web-revoke-${current.scope.noteId}-${current.scope.generation}`,payloadHash:''};
  operation.payloadHash=await calculateSharePayloadHash({...operation.scope,...operation});
  const folder=await shareFolder(token,false,expected);
  if(!folder) throw new Error('共有フォルダーがありません。');
  await uploadCreateOnly(token,folder,`op-${operation.operationId}.json`,new Blob([JSON.stringify(operation)],{type:'application/json'}),expected);
}

async function verifyAccount(token: string, expectedAccount: string): Promise<void> {
  const response = await fetch(`${API}/about?fields=user(emailAddress)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('更新後のGoogleアカウントを確認できません。保存を中止しました。');
  const data = await response.json() as { user?: { emailAddress?: string } };
  const email = data.user?.emailAddress?.trim().toLowerCase();
  if (!email || email !== expectedAccount.trim().toLowerCase()) {
    throw new Error('Googleアカウントが切り替わりました。別のアカウントへの保存を防ぐため中止しました。');
  }
}

async function authorizedFetch(token: string, input: RequestInfo | URL, init?: RequestInit, expectedAccount?: string): Promise<Response> {
  let activeToken = latestAccessToken || token;
  const request = async () => {
    try { return await fetch(input, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${activeToken}` } }); }
    catch {
      const url = String(input);
      const phase = url.includes('/about?') ? 'アカウント確認' : url.includes('alt=media') ? '共有記録の読取' : (init?.method === 'POST' ? '保存' : '一覧取得');
      console.warn('[shared-drive] network failure', { phase, method: init?.method ?? 'GET' });
      throw new Error(`Google Driveの${phase}で通信に失敗しました。${init?.method === 'POST' ? '保存結果を確認できません。' : '取得を完了できませんでした。'}`);
    }
  };
  let response = await request();
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      if (expectedAccount) await verifyAccount(refreshed, expectedAccount);
      latestAccessToken = refreshed;
      activeToken = refreshed;
      response = await request();
    }
  }
  if (!response.ok) throw new Error(`Google Driveへの接続に失敗しました (${response.status})`);
  return response;
}

function queryUrl(params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  return `${API}/files?${query.toString()}`;
}

async function findFolder(token: string, name: string, parentId?: string, expectedAccount?: string): Promise<string | null> {
  const clauses = [`name='${name}'`, "mimeType='application/vnd.google-apps.folder'", 'trashed=false'];
  if (parentId) clauses.push(`'${parentId}' in parents`);
  const response = await authorizedFetch(token, queryUrl({ q: clauses.join(' and '), pageSize: '100', fields: 'files(id,name)' }), undefined, expectedAccount);
  const data = await response.json() as { files?: { id: string }[] };
  return data.files?.[0]?.id ?? null;
}

async function shareFolder(token: string, create: boolean, expectedAccount?: string): Promise<string | null> {
  const appFolder = await findFolder(token, ROOT_FOLDER, undefined, expectedAccount);
  if (!appFolder) return null;
  const found = await findFolder(token, SHARE_FOLDER, appFolder, expectedAccount);
  if (found || !create) return found;
  const response = await authorizedFetch(token, `${API}/files`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: SHARE_FOLDER, mimeType: 'application/vnd.google-apps.folder', parents: [appFolder] }),
  }, expectedAccount);
  const data = await response.json() as { id?: string };
  if (!data.id) throw new Error('共有フォルダーを作成できませんでした');
  return data.id;
}

async function listAll(token: string, folderId: string, expectedAccount?: string) {
  const all: { id: string; name: string; mimeType?: string }[] = [];
  let pageToken: string | undefined;
  do {
    const params: Record<string, string> = {
      q: `'${folderId}' in parents and trashed=false`, pageSize: '1000',
      fields: 'nextPageToken,files(id,name,mimeType)', orderBy: 'name',
    };
    if (pageToken) params.pageToken = pageToken;
    const response = await authorizedFetch(token, queryUrl(params), undefined, expectedAccount);
    const data = await response.json() as { files?: typeof all; nextPageToken?: string };
    all.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return all;
}

async function findFileByName(token: string, folderId: string, name: string, expectedAccount?: string) {
  const q = `'${folderId}' in parents and name='${name}' and trashed=false`;
  const response = await authorizedFetch(token, queryUrl({ q, pageSize: '2', fields: 'files(id,name)' }), undefined, expectedAccount);
  const data = await response.json() as { files?: { id: string; name: string }[] };
  if ((data.files?.length ?? 0) > 1) throw new Error('同じ保存IDのDriveファイルが複数あるため、安全のため停止しました。');
  return data.files?.[0] ?? null;
}

async function connectedAccount(token: string, expectedAccount?: string): Promise<string> {
  const response = await authorizedFetch(token, `${API}/about?fields=user(emailAddress)`, undefined, expectedAccount);
  const data = await response.json() as { user?: { emailAddress?: string } };
  const email = data.user?.emailAddress?.trim().toLowerCase();
  if (!email) throw new Error('Googleアカウントを確認できません');
  return email;
}

async function downloadJson<T>(token: string, fileId: string, expectedAccount?: string): Promise<T> {
  const response = await authorizedFetch(token, `${API}/files/${encodeURIComponent(fileId)}?alt=media`, undefined, expectedAccount);
  return await response.json() as T;
}

export async function loadSharedNotes(token: string, expectedAccount?: string): Promise<{ notes: SharedNote[]; files: { id: string; name: string; mimeType?: string }[] }> {
  latestAccessToken = token;
  const account = await connectedAccount(token, expectedAccount);
  if (expectedAccount && account !== expectedAccount.trim().toLowerCase()) throw new Error('Googleアカウントが切り替わりました。別のアカウントへの保存を防ぐため中止しました。');
  const folder = await shareFolder(token, false, expectedAccount);
  if (!folder) return { notes: [], files: [] };
  const files = await listAll(token, folder, expectedAccount);
  const recordFiles = files.filter((file) => file.name.startsWith('op-') && file.name.endsWith('.json'));
  const records = (await Promise.all(recordFiles.map((file) => downloadJson<unknown>(token, file.id, expectedAccount))))
    .map(parseShareOperation);
  const grouped = new Map<string, { scope: ShareScope; records: unknown[] }>();
  for (const raw of records) {
    const scope = raw.scope;
    if (scope.accountSubject.trim().toLowerCase() !== account) throw new Error('別のGoogleアカウントの共有記録が混在しています。安全のため表示を中止しました。');
    const key = `${scope.accountSubject}\0${scope.noteId}\0${scope.generation}`;
    const group = grouped.get(key) ?? { scope, records: [] };
    group.records.push(raw);
    grouped.set(key, group);
  }
  const notes: SharedNote[] = [];
  for (const group of grouped.values()) {
    const log = await validateShareLogJson(group.scope, group.records);
    const byId = new Map((group.records as ShareOperation[]).map((item) => [item.operationId, item]));
    if ([...byId.values()].some((item) => item.kind === 'revoke')) continue;
    for (const head of log.contentHeads) {
      const operation = byId.get(head);
      if (operation) notes.push({ scope: group.scope, operation, heads: log.contentHeads });
    }
  }
  return { notes: notes.sort((a, b) => a.operation.payload.title.localeCompare(b.operation.payload.title, 'ja')), files };
}

async function uploadCreateOnly(token: string, folderId: string, name: string, data: Blob, expectedAccount: string): Promise<void> {
  const existing = await findFileByName(token, folderId, name, expectedAccount);
  if (existing) {
    const previous = parseShareOperation(await downloadJson<unknown>(token, existing.id, expectedAccount));
    const attempted = parseShareOperation(JSON.parse(await data.text()));
    if (JSON.stringify(previous) === JSON.stringify(attempted)) return;
    throw new Error('同じ保存IDの別内容がDriveにあります。上書きせず保存を止めました。');
  }
  const metadata = new Blob([JSON.stringify({ name, parents: [folderId] })], { type: 'application/json' });
  const form = new FormData();
  form.append('metadata', metadata);
  form.append('file', data, name);
  await authorizedFetch(token, UPLOAD, { method: 'POST', body: form }, expectedAccount);
}

export async function appendWebEdit(
  token: string,
  current: SharedNote,
  payload: { title: string; markdown: string; images: ShareOperation['payload']['images'] },
): Promise<void> {
  latestAccessToken = token;
  if (current.heads.length !== 1 || current.heads[0] !== current.operation.operationId) {
    throw new Error('Windows側にも変更があります。競合を確認するまで保存を保留しました。');
  }
  const payloadHash = await calculateSharePayloadHash({ ...current.scope, kind: 'edit', parents: [current.operation.operationId], resolvedIds: [], payload });
  const seed = `${current.scope.accountSubject}:${current.scope.noteId}:${current.scope.generation}:${current.operation.operationId}:${payloadHash}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  const operationId = `op-${[...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  const operation: ShareOperation = {
    scope: current.scope,
    operationId,
    kind: 'edit',
    parents: [current.operation.operationId],
    resolvedIds: [],
    payload,
    payloadHash,
  };
  const expectedAccount = current.scope.accountSubject.trim().toLowerCase();
  const latestNotes = await loadSharedNotes(token, expectedAccount);
  const latest = latestNotes.notes.find((note) => note.scope.accountSubject === current.scope.accountSubject &&
    note.scope.noteId === current.scope.noteId && note.scope.generation === current.scope.generation);
  if (!latest) throw new Error('この付箋のWeb共有は終了しています。Windowsランチャーから状態を確認してください。');
  if (latest.heads.length === 1 && latest.operation.operationId === operationId &&
      JSON.stringify(latest.operation) === JSON.stringify(parseShareOperation(operation))) return;
  if (latest.heads.length !== 1 || latest.operation.operationId !== current.operation.operationId) {
    throw new Error('別の端末で変更されています。「Webを更新」してから編集してください。');
  }
  const folder = await shareFolder(token, true, expectedAccount);
  if (!folder) throw new Error('Driveの「ore-no-fusen」フォルダーが見つかりません。先にWindowsから同期してください。');
  await uploadCreateOnly(token, folder, `op-${operationId}.json`, new Blob([JSON.stringify(operation)], { type: 'application/json' }), expectedAccount);
}

export async function downloadSharedImage(token: string, files: { id: string; name: string }[], manifest: ShareOperation['payload']['images'][number]): Promise<string> {
  if (!Number.isSafeInteger(manifest.sizeBytes) || manifest.sizeBytes < 1 || manifest.sizeBytes > 50 * 1024 * 1024) throw new Error('共有画像のサイズ上限を超えています');
  const file = files.find((entry) => entry.name === `image-${manifest.sha256}`);
  if (!file) throw new Error('共有画像が見つかりません');
  const response = await authorizedFetch(token, `${API}/files/${encodeURIComponent(file.id)}?alt=media`);
  const advertisedLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(advertisedLength) && advertisedLength > 50 * 1024 * 1024) throw new Error('共有画像のサイズ上限を超えています');
  if (!response.body) throw new Error('共有画像を読み取れません');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 50 * 1024 * 1024 || total > manifest.sizeBytes) {
        await reader.cancel();
        throw new Error('共有画像のサイズ上限を超えています');
      }
      const owned = new Uint8Array(value.byteLength);
      owned.set(value);
      chunks.push(owned);
    }
  } finally {
    reader.releaseLock();
  }
  if (total !== manifest.sizeBytes) throw new Error('共有画像のサイズが一致しません');
  const allowed = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp']);
  const responseMimeType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
  if (!allowed.has(manifest.mimeType) || responseMimeType !== manifest.mimeType) throw new Error('共有画像の形式が一致しません');
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  chunks.length = 0;
  const digest = await crypto.subtle.digest('SHA-256', bytes.buffer);
  const sha256 = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  if (sha256 !== manifest.sha256 || manifest.imageId !== `img-${sha256}`) throw new Error('共有画像の確認に失敗しました');
  const blob = new Blob([bytes], { type: responseMimeType });
  return URL.createObjectURL(blob);
}
