import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateSharePayloadHash } from '@/lib/web-share-payload-hash';
import type { ShareOperation, ShareScope } from '@/lib/web-share-contract';

vi.mock('@/app/viewer/lib/drive', () => ({ refreshAccessToken: vi.fn(async () => null) }));
import { refreshAccessToken } from '@/app/viewer/lib/drive';

const scope: ShareScope = { accountSubject: 'uck@example.test', noteId: 'note-1', generation: 1 };
const rootId = `root:${new TextEncoder().encode(scope.accountSubject).length}:${scope.accountSubject}:${new TextEncoder().encode(scope.noteId).length}:${scope.noteId}:${scope.generation}`;
const payload = { title: '買い物リスト', markdown: '- [ ] 牛乳\n- [x] 卵', images: [] };

async function seedOperation(): Promise<ShareOperation> {
  return {
    scope, operationId: 'op-seed', kind: 'edit', parents: [rootId], resolvedIds: [], payload,
    payloadHash: await calculateSharePayloadHash({ ...scope, kind: 'edit', parents: [rootId], resolvedIds: [], payload }),
  };
}

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('shared Drive storage', () => {
  it('loads a saved creation before Windows import and replaces it without duplication after publication', async () => {
    const request = { schemaVersion: 1, accountSubject: scope.accountSubject, targetPcId: '11111111-1111-4111-8111-111111111111', noteId: '22222222-2222-4222-8222-222222222222', markdown: '新規の表示\n本文\n- [ ] 確認' };
    let published = false;
    const seed = await seedOperation();
    seed.scope = { ...scope, noteId: request.noteId };
    seed.parents = [`root:${new TextEncoder().encode(scope.accountSubject).length}:${scope.accountSubject}:${request.noteId.length}:${request.noteId}:1`];
    seed.payloadHash = await calculateSharePayloadHash({ ...seed.scope, ...seed });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/about?')) return jsonResponse({ user: { emailAddress: scope.accountSubject } });
      if (url.includes('/files?')) {
        const q = new URL(url).searchParams.get('q') ?? '';
        if (q.includes("name='ore-no-fusen'")) return jsonResponse({ files: [{ id: 'root' }] });
        if (q.includes("name='web-share-temp'")) return jsonResponse({ files: [{ id: 'share' }] });
        return jsonResponse({ files: [{ id: 'creation', name: `web-request-${request.noteId}.json` }, ...(published ? [{ id: 'published', name: 'op-op-seed.json' }] : [])] });
      }
      if (url.includes('/files/creation?')) return jsonResponse(request);
      if (url.includes('/files/published?')) return jsonResponse(seed);
      throw new Error('unexpected');
    }));
    const { loadSharedNotes, appendWebEdit } = await import('./drive');
    const before = await loadSharedNotes('token');
    expect(before.notes).toHaveLength(1);
    expect(before.notes[0].pendingCreate).toBe(true);
    expect(before.notes[0].operation.payload.markdown).toBe(request.markdown);
    await expect(appendWebEdit('token', before.notes[0], before.notes[0].operation.payload)).rejects.toThrow('取込後');
    expect((await loadSharedNotes('token')).notes).toHaveLength(1);
    published = true;
    const after = await loadSharedNotes('token');
    expect(after.notes).toHaveLength(1);
    expect(after.notes[0].pendingCreate).toBeUndefined();
    expect(after.notes[0].scope.noteId).toBe(request.noteId);
  });
  it('reuses only records with the same freshly listed Drive version and downloads changed/unversioned records', async () => {
    const seed=await seedOperation(); let version:string|undefined='1'; let downloads=0;
    vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{
      const url=String(input);
      if(url.includes('/about?'))return jsonResponse({user:{emailAddress:scope.accountSubject}});
      if(url.includes('/files?')) {
        const q=new URL(url).searchParams.get('q')??'';
        if(q.includes("name='ore-no-fusen'"))return jsonResponse({files:[{id:'root'}]});
        if(q.includes("name='web-share-temp'"))return jsonResponse({files:[{id:'share'}]});
        return jsonResponse({files:[{id:'version-test-seed',name:'op-op-seed.json',version}]});
      }
      if(url.includes('/files/version-test-seed?')){downloads++;return jsonResponse(seed);}
      throw new Error('unexpected');
    }));
    const {loadSharedNotes}=await import('./drive');
    await loadSharedNotes('token');await loadSharedNotes('token');expect(downloads).toBe(1);
    version='2';await loadSharedNotes('token');expect(downloads).toBe(2);
    version=undefined;await loadSharedNotes('token');await loadSharedNotes('token');expect(downloads).toBe(4);
  });
  it('stops and resumes only Web sharing, survives reload and rejects stale settings without touching note data', async () => {
    const seed = await seedOperation();
    const settings: {id:string; name:string; value:unknown}[] = [];
    const writes: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method && init.method !== 'GET') {
        writes.push(init.method);
        const form = init.body as FormData;
        const read = (blob: Blob) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(blob); });
        const value = JSON.parse(await read(form.get('file') as Blob));
        const metadata = JSON.parse(await read(form.get('metadata') as Blob));
        expect(metadata.name).toMatch(/^web-sharing-/);
        expect(value.payload).toBeUndefined();
        settings.push({id:`setting-${settings.length}`,name:metadata.name,value});
        return jsonResponse({id:'saved'});
      }
      if (url.includes('/about?')) return jsonResponse({user:{emailAddress:scope.accountSubject}});
      if (url.includes('/files?')) {
        const q = new URL(url).searchParams.get('q') ?? '';
        if (q.includes("name='ore-no-fusen'")) return jsonResponse({files:[{id:'root'}]});
        if (q.includes("name='web-share-temp'")) return jsonResponse({files:[{id:'folder'}]});
        return jsonResponse({files:[{id:'seed',name:'op-op-seed.json'},...settings.map(({id,name})=>({id,name}))]});
      }
      if (url.includes('/files/seed?')) return jsonResponse(seed);
      const setting = settings.find(item=>url.includes(`/files/${item.id}?`));
      if (setting) return jsonResponse(setting.value);
      throw new Error('Unexpected request');
    }));
    const {loadSharedNotes,setWebSharing,appendWebEdit} = await import('./drive');
    const initial = (await loadSharedNotes('token')).notes[0];
    await setWebSharing('token', initial, true);
    const stopped = await loadSharedNotes('token');
    expect(stopped.notes).toHaveLength(0);
    expect(stopped.stoppedNotes[0].operation).toEqual(initial.operation);
    expect((await loadSharedNotes('token')).stoppedNotes).toHaveLength(1);
    await expect(appendWebEdit('token', initial, payload)).rejects.toThrow('共有は終了');
    await expect(setWebSharing('token', initial, false)).rejects.toThrow('共有設定が変わりました');
    await setWebSharing('token', stopped.stoppedNotes[0], false);
    const resumed = await loadSharedNotes('token');
    expect(resumed.notes[0].operation).toEqual(initial.operation);
    expect(resumed.stoppedNotes).toHaveLength(0);
    expect((settings[1].value as {parents:string[]}).parents).toEqual(stopped.stoppedNotes[0].sharingHeads);
    expect(writes).toEqual(['POST','POST']);
  });
  it('deduplicates a Web create retry and rejects a changed request or account', async () => {
    const request={schemaVersion:1 as const,accountSubject:'uck@example.test',targetPcId:'11111111-1111-4111-8111-111111111111',noteId:'22222222-2222-4222-8222-222222222222',markdown:'試験\n**太字**'};
    let uploaded=false;let writes=0;
    vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
      const url=String(input);
      if(init?.method==='POST'){writes++;uploaded=true;return jsonResponse({id:'created'});}
      if(url.includes('/about?'))return jsonResponse({user:{emailAddress:request.accountSubject}});
      if(url.includes('/files?')){
        const q=new URL(url).searchParams.get('q')??'';
        if(q.includes("name='ore-no-fusen'"))return jsonResponse({files:[{id:'root-folder'}]});
        if(q.includes("name='web-share-temp'"))return jsonResponse({files:[{id:'share-folder'}]});
        return jsonResponse({files:[{id:'pc',name:`web-pc-${request.targetPcId}.json`},...(uploaded?[{id:'request',name:`web-request-${request.noteId}.json`}]:[])]});
      }
      if(url.includes('/files/pc?'))return jsonResponse({schemaVersion:1,accountSubject:request.accountSubject,pcId:request.targetPcId,name:'試験PC'});
      if(url.includes('/files/request?'))return jsonResponse(request);
      throw new Error(`Unexpected ${url}`);
    }));
    const {submitWebCreate}=await import('./drive');
    await submitWebCreate('token',request);await submitWebCreate('token',request);expect(writes).toBe(1);
    await expect(submitWebCreate('token',{...request,markdown:'別内容'})).rejects.toThrow('内容が異なります');
    await expect(submitWebCreate('token',{...request,accountSubject:'other@test'})).rejects.toThrow('アカウント');
    expect(writes).toBe(1);
  });
  it('reads all Drive pages and validates records before returning notes', async () => {
    const seed = await seedOperation();
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/about?')) return jsonResponse({ user: { emailAddress: 'uck@example.test' } });
      if (url.includes('/files?')) {
        const parsed = new URL(url);
        const q = parsed.searchParams.get('q') ?? '';
        if (q.includes("name='ore-no-fusen'")) return jsonResponse({ files: [{ id: 'root-folder' }] });
        if (q.includes("name='web-share-temp'")) return jsonResponse({ files: [{ id: 'share-folder' }] });
        if (parsed.searchParams.has('pageToken')) return jsonResponse({ files: [{ id: 'image-file', name: 'image-deadbeef' }] });
        return jsonResponse({ files: [{ id: 'record-file', name: 'op-op-seed.json' }], nextPageToken: 'next' });
      }
      if (url.includes('/files/record-file?alt=media')) return jsonResponse(seed);
      throw new Error(`Unexpected request ${url}`);
    }));

    const { loadSharedNotes } = await import('./drive');
    const result = await loadSharedNotes('test-token');
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].operation.operationId).toBe('op-seed');
    expect(calls.filter((url) => new URL(url).searchParams.has('pageToken'))).toHaveLength(1);
    expect(calls.every((url) => !url.includes('PATCH'))).toBe(true);
  });

  it('creates an append-only edit and refuses a known concurrent head without writing', async () => {
    const seed = await seedOperation();
    const calls: { url: string; method: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method });
      if (url.includes('/about?')) return jsonResponse({ user: { emailAddress: 'uck@example.test' } });
      if (url.includes('/files?')) {
        const q = new URL(url).searchParams.get('q') ?? '';
        if (q.includes("name='ore-no-fusen'")) return jsonResponse({ files: [{ id: 'root-folder' }] });
        if (q.includes("name='web-share-temp'")) return jsonResponse({ files: [{ id: 'share-folder' }] });
        if (q.includes("'share-folder' in parents") && q.includes('name=')) return jsonResponse({ files: [] });
        if (q.includes("'share-folder' in parents")) return jsonResponse({ files: [{ id: 'seed-file', name: 'op-op-seed.json' }] });
      }
      if (url.includes('/files/seed-file?alt=media')) return jsonResponse(seed);
      if (url.includes('/upload/drive/v3/files')) return jsonResponse({ id: 'new-operation' });
      throw new Error(`Unexpected request ${url}`);
    }));
    const { appendWebEdit } = await import('./drive');
    await appendWebEdit('test-token', { scope, operation: seed, heads: ['op-seed'] }, { ...payload, markdown: '- [x] 牛乳' });
    expect(calls.some((call) => call.method === 'POST' && call.url.includes('/upload/drive/v3/files'))).toBe(true);
    expect(calls.some((call) => call.method === 'PATCH' || call.method === 'DELETE')).toBe(false);

    calls.length = 0;
    await expect(appendWebEdit('test-token', { scope, operation: seed, heads: ['op-seed', 'other'] }, payload))
      .rejects.toThrow('競合を確認するまで保存を保留');
    expect(calls).toHaveLength(0);
  });

  it('stops a save when a 401 refresh changes the Google account before the Drive write', async () => {
    const seed = await seedOperation();
    vi.mocked(refreshAccessToken).mockResolvedValueOnce('account-b-token');
    const calls: { url: string; method: string; authorization?: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const headers = new Headers(init?.headers);
      calls.push({ url, method, authorization: headers.get('Authorization') ?? undefined });
      if (url.includes('/about?')) {
        return jsonResponse({ user: { emailAddress: headers.get('Authorization') === 'Bearer account-b-token' ? 'other@example.test' : 'uck@example.test' } });
      }
      if (url.includes('/files?')) {
        const q = new URL(url).searchParams.get('q') ?? '';
        if (q.includes("name='ore-no-fusen'")) return jsonResponse({ files: [{ id: 'root-folder' }] });
        if (q.includes("name='web-share-temp'")) return jsonResponse({ files: [{ id: 'share-folder' }] });
        if (q.includes("'share-folder' in parents") && q.includes('name=')) return jsonResponse({ files: [] });
        if (q.includes("'share-folder' in parents")) return jsonResponse({ files: [{ id: 'seed-file', name: `op-${seed.operationId}.json` }] });
      }
      if (url.includes('/files/seed-file?alt=media')) return jsonResponse(seed);
      if (url.includes('/upload/drive/v3/files')) return new Response(null, { status: 401 });
      throw new Error(`Unexpected request ${url}`);
    }));

    const { appendWebEdit } = await import('./drive');
    await expect(appendWebEdit('account-a-token', { scope, operation: seed, heads: [seed.operationId] }, { ...payload, markdown: '- [x] 牛乳' }))
      .rejects.toThrow('Googleアカウントが切り替わりました');
    expect(calls.filter((call) => call.url.includes('/upload/drive/v3/files'))).toHaveLength(1);
    expect(calls.find((call) => call.url.includes('/upload/drive/v3/files'))?.authorization).toBe('Bearer account-a-token');
  });

  it('treats a retry as success when the exact operation already reached Drive', async () => {
    const seed = await seedOperation();
    const editedPayload = { ...payload, markdown: '- [x] 牛乳' };
    const payloadHash = await calculateSharePayloadHash({ ...scope, kind: 'edit', parents: [seed.operationId], resolvedIds: [], payload: editedPayload });
    const operationSeed = `${scope.accountSubject}:${scope.noteId}:${scope.generation}:${seed.operationId}:${payloadHash}`;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(operationSeed));
    const operationId = `op-${[...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
    const alreadySaved: ShareOperation = {
      scope, operationId, kind: 'edit', parents: [seed.operationId], resolvedIds: [], payload: editedPayload, payloadHash,
    };
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.includes('/about?')) return jsonResponse({ user: { emailAddress: 'uck@example.test' } });
      if (url.includes('/files?')) {
        const q = new URL(url).searchParams.get('q') ?? '';
        if (q.includes("name='ore-no-fusen'")) return jsonResponse({ files: [{ id: 'root-folder' }] });
        if (q.includes("name='web-share-temp'")) return jsonResponse({ files: [{ id: 'share-folder' }] });
        return jsonResponse({ files: [
          { id: 'seed-file', name: `op-${seed.operationId}.json` },
          { id: 'saved-file', name: `op-${alreadySaved.operationId}.json` },
        ] });
      }
      if (url.includes('/files/seed-file?alt=media')) return jsonResponse(seed);
      if (url.includes('/files/saved-file?alt=media')) return jsonResponse(alreadySaved);
      throw new Error(`Unexpected request ${url}`);
    }));
    const { appendWebEdit } = await import('./drive');
    await expect(appendWebEdit('test-token', { scope, operation: seed, heads: [seed.operationId] }, editedPayload)).resolves.toBeUndefined();
    expect(calls.some((call) => call.startsWith('POST ') || call.startsWith('PATCH ') || call.startsWith('DELETE '))).toBe(false);
  });

  it('rejects records owned by a different Google account', async () => {
    const other = { ...(await seedOperation()), scope: { ...scope, accountSubject: 'other@example.test' } };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/about?')) return jsonResponse({ user: { emailAddress: 'uck@example.test' } });
      if (url.includes('/files?')) {
        const q = new URL(url).searchParams.get('q') ?? '';
        if (q.includes("name='ore-no-fusen'")) return jsonResponse({ files: [{ id: 'root-folder' }] });
        if (q.includes("name='web-share-temp'")) return jsonResponse({ files: [{ id: 'share-folder' }] });
        return jsonResponse({ files: [{ id: 'record-file', name: 'op-other.json' }] });
      }
      if (url.includes('/files/record-file?alt=media')) return jsonResponse(other);
      throw new Error(`Unexpected request ${url}`);
    }));
    const { loadSharedNotes } = await import('./drive');
    await expect(loadSharedNotes('test-token')).rejects.toThrow('別のGoogleアカウント');
  });

  it('hides notes after a validated Windows share-revocation record', async () => {
    const seed = await seedOperation();
    const revoke: ShareOperation = {
      ...seed, operationId: 'op-revoke', kind: 'revoke', parents: [], resolvedIds: [],
      payloadHash: await calculateSharePayloadHash({ ...scope, kind: 'revoke', parents: [], resolvedIds: [], payload }),
    };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/about?')) return jsonResponse({ user: { emailAddress: 'uck@example.test' } });
      if (url.includes('/files?')) {
        const q = new URL(url).searchParams.get('q') ?? '';
        if (q.includes("name='ore-no-fusen'")) return jsonResponse({ files: [{ id: 'root-folder' }] });
        if (q.includes("name='web-share-temp'")) return jsonResponse({ files: [{ id: 'share-folder' }] });
        return jsonResponse({ files: [{ id: 'seed-file', name: 'op-op-seed.json' }, { id: 'revoke-file', name: 'op-op-revoke.json' }] });
      }
      if (url.includes('/files/seed-file?alt=media')) return jsonResponse(seed);
      if (url.includes('/files/revoke-file?alt=media')) return jsonResponse(revoke);
      throw new Error(`Unexpected request ${url}`);
    }));
    const { loadSharedNotes } = await import('./drive');
    expect((await loadSharedNotes('test-token')).notes).toHaveLength(0);
  });

  it('verifies shared image bytes against size, MIME type, and SHA-256', async () => {
    const bytes = new TextEncoder().encode('test image bytes');
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const sha256 = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
    const manifest = { imageId: `img-${sha256}`, mimeType: 'image/png', sizeBytes: bytes.length, sha256 };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, { status: 200, headers: { 'Content-Type': 'image/png' } })));
    const { downloadSharedImage } = await import('./drive');
    const url = await downloadSharedImage('test-token', [{ id: 'image-file', name: `image-${sha256}` }], manifest);
    expect(url.startsWith('blob:')).toBe(true);
    URL.revokeObjectURL(url);
    const altered = bytes.slice();
    altered[0] ^= 1;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(altered, { status: 200, headers: { 'Content-Type': 'image/png' } })));
    await expect(downloadSharedImage('test-token', [{ id: 'image-file', name: `image-${sha256}` }], manifest))
      .rejects.toThrow('画像の確認に失敗');
  });
});
