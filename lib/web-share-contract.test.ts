import { describe, expect, it } from 'vitest';
import { validateShareLog, validateShareLogJson, type ShareOperation, type ShareScope } from './web-share-contract';
import { calculateSharePayloadHash, type ShareHashInput } from './web-share-payload-hash';
import rustWireFixture from '../test-fixtures/web-share-operation-v1.json';
import v2WireFixture from '../test-fixtures/web-share-operation-v2.json';

const scope: ShareScope = { accountSubject: 'acct-1', noteId: 'note-1', generation: 4 };
const rootId = 'root:6:acct-1:6:note-1:4';

async function operation(
  operationId: string,
  kind: ShareHashInput['kind'],
  parents: string[],
  changes: Partial<ShareHashInput> = {},
): Promise<ShareOperation> {
  const input: ShareHashInput = {
    ...scope,
    kind,
    parents,
    resolvedIds: [],
    payload: { title: 'Title', markdown: 'Body', images: [] },
    ...changes,
  };
  return {
    scope: { accountSubject: input.accountSubject, noteId: input.noteId, generation: input.generation },
    kind: input.kind,
    parents: input.parents,
    resolvedIds: input.resolvedIds,
    payload: input.payload,
    operationId,
    payloadHash: await calculateSharePayloadHash(input),
  };
}

describe('validateShareLog', () => {
  it('payload schema v2ハッシュに色とタグを含め、旧v1 fixtureも読める', async () => {
    const base: ShareHashInput = {
      ...scope,
      kind: 'edit',
      parents: [rootId],
      resolvedIds: [],
      payload: { schemaVersion: 2, title: 'Title', markdown: 'Body', images: [], backgroundColor: '#80d8ff', tags: ['旅行', '予定'] },
    };
    const first = await calculateSharePayloadHash(base);
    await expect(calculateSharePayloadHash({ ...base, payload: { ...base.payload, tags: ['予定', '旅行'] } }))
      .resolves.toBe(first);
    await expect(calculateSharePayloadHash({ ...base, payload: { ...base.payload, backgroundColor: '#ffcdd2' } }))
      .resolves.not.toBe(first);
    await expect(validateShareLogJson(scope, [JSON.parse(JSON.stringify(rustWireFixture))]))
      .resolves.toMatchObject({ contentHeads: ['op-fixed'] });
    await expect(calculateSharePayloadHash({ ...base, payload: { ...base.payload, backgroundColor: 'url(javascript:bad)' } }))
      .rejects.toThrow('Invalid background color');
    await expect(calculateSharePayloadHash({ ...base, payload: { ...base.payload, backgroundColor: '' } }))
      .rejects.toThrow('Invalid background color');
    await expect(calculateSharePayloadHash({ ...base, payload: { ...base.payload, tags: ['shortcut'] } }))
      .rejects.toThrow('Invalid tags');
    await expect(calculateSharePayloadHash({ ...base, payload: { ...base.payload, tags: ['LINK'] } }))
      .rejects.toThrow('Invalid tags');
    await expect(calculateSharePayloadHash({ ...base, payload: { ...base.payload, tags: ['買い物', '買い物'] } }))
      .rejects.toThrow('Invalid tags');
    await expect(calculateSharePayloadHash({ ...base, payload: { ...base.payload, tags: ['I', 'i'] } }))
      .rejects.toThrow('Invalid tags');
    await expect(calculateSharePayloadHash({ ...base, payload: { ...base.payload, schemaVersion: 1, backgroundColor: '' } }))
      .rejects.toThrow('Display metadata requires payload schema 2');
  });

  it('色と日本語タグを含むRust/Web共通v2 fixtureの固定hashを検証する', async () => {
    await expect(validateShareLogJson(scope, [JSON.parse(JSON.stringify(v2WireFixture))]))
      .resolves.toMatchObject({ contentHeads: ['op-v2-fixed'] });
    const invalidColor = JSON.parse(JSON.stringify(v2WireFixture)) as { payload: { backgroundColor: string } };
    invalidColor.payload.backgroundColor = '';
    await expect(validateShareLogJson(scope, [invalidColor])).rejects.toThrow('payload.backgroundColor is invalid');
  });

  it('順序に関係なく連鎖を検証し、本文先端と制御記録を分ける', async () => {
    const first = await operation('op-1', 'edit', [rootId]);
    const second = await operation('op-2', 'edit', ['op-1']);
    const ack = await operation('ack-1', 'acknowledge', []);
    await expect(validateShareLog(scope, [ack, second, first])).resolves.toMatchObject({
      rootId,
      contentHeads: ['op-2'],
      controlRecords: ['ack-1'],
    });
    const rustWireJson = JSON.parse(JSON.stringify(first)) as ShareOperation;
    await expect(validateShareLog(scope, [rustWireJson])).resolves.toMatchObject({ contentHeads: ['op-1'] });
  });

  it('Rust/仕様と共有する保存形式fixtureをそのまま検証する', async () => {
    const fixture: unknown = JSON.parse(JSON.stringify(rustWireFixture));
    await expect(validateShareLogJson(scope, [fixture])).resolves.toMatchObject({
      contentHeads: ['op-fixed'],
    });
  });

  it('両方の先端を明示した解決だけを受け付ける', async () => {
    const first = await operation('op-a', 'edit', [rootId]);
    const second = await operation('op-b', 'edit', [rootId]);
    const resolution = await operation('op-r', 'resolve', ['op-a', 'op-b'], {
      resolvedIds: ['op-b', 'op-a'],
    });
    await expect(validateShareLog(scope, [first, second, resolution])).resolves.toMatchObject({
      contentHeads: ['op-r'],
    });
    const incomplete = await operation('op-r', 'resolve', ['op-a', 'op-b'], { resolvedIds: ['op-a'] });
    await expect(validateShareLog(scope, [first, second, incomplete])).rejects.toThrow('Resolution must name every distinct parent');
  });

  it('別scope・未知親・ACK親・改ざんpayloadを拒否する', async () => {
    const valid = await operation('op-1', 'edit', [rootId]);
    await expect(validateShareLog({ ...scope, accountSubject: 'acct-2' }, [valid])).rejects.toThrow('Wrong scope');
    const unknown = await operation('op-2', 'edit', ['missing']);
    await expect(validateShareLog(scope, [unknown])).rejects.toThrow('Missing parent');
    const ack = await operation('ack-1', 'acknowledge', []);
    const child = await operation('op-2', 'edit', ['ack-1']);
    await expect(validateShareLog(scope, [ack, child])).rejects.toThrow('Control record used as parent');
    await expect(validateShareLog(scope, [{ ...valid, payload: { ...valid.payload, markdown: 'tampered' } }]))
      .rejects.toThrow('Payload hash mismatch');
  });

  it('同じIDの同じ記録は冪等、異なる内容と循環は拒否する', async () => {
    const first = await operation('op-1', 'edit', [rootId]);
    await expect(validateShareLog(scope, [first, first])).resolves.toMatchObject({ contentHeads: ['op-1'] });
    const changed = await operation('op-1', 'edit', [rootId], {
      payload: { title: 'Other', markdown: 'Body', images: [] },
    });
    await expect(validateShareLog(scope, [first, changed])).rejects.toThrow('Duplicate ID with different payload');
    const cycleA = await operation('cycle-a', 'edit', ['cycle-b']);
    const cycleB = await operation('cycle-b', 'edit', ['cycle-a']);
    await expect(validateShareLog(scope, [cycleA, cycleB])).rejects.toThrow('Cycle in share log');
  });

  it('不信JSONの型・operationIdと画像プロパティ順を安全に扱う', async () => {
    const image = { imageId: 'image-1', mimeType: 'image/png', sizeBytes: 1, sha256: 'a'.repeat(64) };
    const first = await operation('op-image', 'edit', [rootId], {
      payload: { title: 'Title', markdown: 'Body', images: [image] },
    });
    const reorderedProperties = {
      ...first,
      payload: {
        ...first.payload,
        images: [{ sha256: image.sha256, sizeBytes: image.sizeBytes, mimeType: image.mimeType, imageId: image.imageId }],
      },
    } as ShareOperation;
    await expect(validateShareLog(scope, [first, reorderedProperties])).resolves.toMatchObject({
      contentHeads: ['op-image'],
    });
    await expect(validateShareLog(scope, [{ ...first, operationId: '\uD800' }]))
      .rejects.toThrow('Invalid operation ID');
    await expect(validateShareLog(scope, [{
      ...first,
      payload: { ...first.payload, title: 123 },
    } as unknown as ShareOperation])).rejects.toThrow('Invalid payload');
  });

  it('JSON境界で壊れた型、世代、operationIdを適用前に拒否する', async () => {
    const fixture: unknown = JSON.parse(JSON.stringify(rustWireFixture));
    const valid = rustWireFixture as unknown as Record<string, unknown>;
    const badTitle = { ...valid, payload: { ...(valid.payload as object), title: 123 } };
    await expect(validateShareLogJson(scope, [badTitle])).rejects.toThrow('payload.title must be a string');
    const badGeneration = {
      ...valid,
      scope: { ...(valid.scope as object), generation: Number.MAX_SAFE_INTEGER + 1 },
    };
    await expect(validateShareLogJson(scope, [badGeneration])).rejects.toThrow('scope.generation must be a u32');
    const badId = { ...valid, operationId: '\uD800' };
    await expect(validateShareLogJson(scope, [badId])).rejects.toThrow('operationId contains invalid UTF-16');
    await expect(validateShareLogJson(scope, [fixture])).resolves.toMatchObject({ contentHeads: ['op-fixed'] });
  });
});
