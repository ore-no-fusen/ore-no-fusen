import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateSharePayloadHash } from '@/lib/web-share-payload-hash';
import type { ShareOperation, ShareScope } from '@/lib/web-share-contract';

vi.mock('@/app/viewer/lib/drive', () => ({ refreshAccessToken: vi.fn(async () => null) }));

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
