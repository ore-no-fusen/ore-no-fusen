import test from 'node:test';
import assert from 'node:assert/strict';
import { activeShareGeneration, deduplicate, evaluate, hasExactOperationIds, legacyPayloadHash, payloadHash, saveCriticalRecord, validateFixtureMetadata } from './causal-contract.mjs';

const scope = { accountSubject: 'synthetic-account', noteId: 'synthetic-note', shareGeneration: 'generation-1' };
const op = (operationId, parents, payload = operationId, extra = {}) => ({
  ...scope,
  operationId,
  parentOperationIds: parents,
  payload: { text: payload },
  imageManifest: [],
  ...extra,
});

test('ACK does not hide a late sibling branch', () => {
  const result = evaluate([op('A', ['root:0']), op('B', ['root:0'])], scope);
  assert.deepEqual(result.heads, ['A', 'B']);
});

test('local edit after ACK remains in conflict with a later sibling', () => {
  const result = evaluate([op('A', ['root:0']), op('B', ['root:0']), op('C', ['A'])], scope);
  assert.deepEqual(result.heads, ['B', 'C']);
});

test('resolution covers all heads and late old-branch child is quarantined', () => {
  const records = [
    op('A', ['root:0']), op('B', ['root:0']), op('C', ['A']),
    op('R', ['B', 'C'], 'chosen', { resolvedOperationIds: ['B', 'C'] }),
    op('late-E', ['B']),
  ];
  const result = evaluate(records, scope);
  assert.deepEqual(result.heads, ['R']);
  assert.ok(result.rejected.some(entry => entry.operationId === 'late-E' && entry.reason === 'late-child-of-resolved-branch'));
});

test('quarantine propagates through every descendant of a resolved branch', () => {
  const records = [
    op('A', ['root:0']), op('B', ['root:0']),
    op('R', ['A', 'B'], 'chosen', { resolvedOperationIds: ['A', 'B'] }),
    op('late-E', ['B']), op('late-F', ['late-E']),
  ];
  const result = evaluate(records, scope);
  assert.deepEqual(result.heads, ['R']);
  assert.ok(result.rejected.some(entry => entry.operationId === 'late-E' && entry.reason === 'late-child-of-resolved-branch'));
  assert.ok(result.rejected.some(entry => entry.operationId === 'late-F' && entry.reason === 'descendant-of-quarantined-branch'));
});

test('cyclic parent graphs and their descendants cannot appear complete', () => {
  const result = evaluate([op('A', ['B']), op('B', ['A']), op('child', ['A'])], scope);
  assert.equal(result.complete, false);
  assert.deepEqual(result.heads, []);
  assert.deepEqual(result.rejected, [
    { operationId: 'A', reason: 'cyclic-parent-graph' },
    { operationId: 'B', reason: 'cyclic-parent-graph' },
    { operationId: 'child', reason: 'missing-parent' },
  ]);
});

test('arrival order does not change the resolved DAG result', () => {
  const records = [
    op('A', ['root:0']), op('B', ['root:0']), op('C', ['A']),
    op('R', ['B', 'C'], 'chosen', { resolvedOperationIds: ['B', 'C'] }),
    op('late-E', ['B']),
  ];
  const forward = evaluate(records, scope);
  const reverse = evaluate([...records].reverse(), scope);
  assert.deepEqual(reverse.heads, forward.heads);
  assert.deepEqual(reverse.rejected, forward.rejected);
});

test('multiple pending operations produce the same rejection order regardless of Drive page order', () => {
  const records = [op('orphan-a', ['missing-a']), op('orphan-b', ['missing-b']), op('A', ['root:0'])];
  const forward = evaluate(records, scope);
  const reverse = evaluate([...records].reverse(), scope);
  assert.deepEqual(reverse, forward);
});

test('operation with a missing parent stays pending instead of becoming a head', () => {
  const result = evaluate([op('orphan', ['missing-parent'])], scope);
  assert.deepEqual(result.heads, []);
  assert.deepEqual(result.rejected, [{ operationId: 'orphan', reason: 'missing-parent' }]);
});

test('incomplete Drive pagination blocks a sync-complete result', () => {
  const result = evaluate([op('A', ['root:0'])], { ...scope, allPagesRead: false });
  assert.equal(result.complete, false);
  assert.deepEqual(result.rejected, [{ operationId: null, reason: 'incomplete-pagination' }]);
});

test('operation referring to a missing image stays pending', () => {
  const result = evaluate([op('image-note', ['root:0'], 'note', { imageManifest: [{ id: 'missing-image' }] })], {
    ...scope,
    availableImageIds: new Set(),
  });
  assert.equal(result.complete, false);
  assert.deepEqual(result.heads, []);
  assert.equal(result.rejected[0].reason, 'missing-image');
});

test('old generation records are held and cannot become active', () => {
  const result = evaluate([op('old', ['root:0'], 'old', { shareGeneration: 'generation-0' })], scope);
  assert.deepEqual(result.heads, []);
  assert.equal(result.rejected[0].reason, 'scope-or-generation-mismatch');
});

test('hash includes scope, parent set, payload and image manifest, while parent order is canonical', () => {
  const first = op('same', ['A', 'B'], 'same');
  const reordered = op('same', ['B', 'A'], 'same');
  assert.equal(payloadHash(first), payloadHash(reordered));
  assert.notEqual(payloadHash(first), payloadHash({ ...first, shareGeneration: 'generation-2' }));
  assert.notEqual(payloadHash(first), payloadHash({ ...first, imageManifest: [{ id: 'image-1' }] }));
  assert.notEqual(payloadHash(first), payloadHash({ ...first, resolvedOperationIds: ['A'] }));
  assert.notEqual(payloadHash(first), payloadHash({ ...first, recordType: 'share-revocation', nextShareGeneration: 'next' }));
  assert.equal(deduplicate([first, reordered]).length, 1);
  assert.throws(() => deduplicate([first, { ...first, payload: { text: 'different' } }]), /operationId collision/);
  const persisted = { ...first, payloadHashVersion: 2, payloadHash: payloadHash(first) };
  assert.throws(() => deduplicate([{ ...persisted, resolvedOperationIds: ['A'] }]), /payloadHash mismatch/);
  const legacy = { ...first, payloadHash: legacyPayloadHash(first) };
  assert.equal(deduplicate([legacy]).length, 1);
});

test('expected operation IDs are compared as a set, not by count alone', () => {
  const expected = new Set(['A', 'B', 'C']);
  assert.equal(hasExactOperationIds([op('A', []), op('A', []), op('C', [])], expected), false);
  assert.equal(hasExactOperationIds([op('A', []), op('B', []), op('C', [])], expected), true);
});

test('read-only fixture validation accepts only the saved dedicated folder, note, and image', () => {
  const generation = '12345678-aaaa';
  const ids = { folderId: 'folder-1', noteId: 'note-1', imageId: 'image-1' };
  const folder = { id: ids.folderId, name: '全付箋補完計画-API検証-12345678', mimeType: 'application/vnd.google-apps.folder', appProperties: { fusenSpike: generation }, trashed: false };
  const note = { id: ids.noteId, name: '検証メモ.json', mimeType: 'application/json', parents: [ids.folderId], appProperties: { fusenSpike: generation }, trashed: false };
  const image = { id: ids.imageId, name: '検証画像.png', mimeType: 'image/png', parents: [ids.folderId], appProperties: { fusenSpike: generation }, trashed: false };
  assert.equal(validateFixtureMetadata({ generation, folder, note, image, ids }), true);
  assert.throws(() => validateFixtureMetadata({ generation, folder, note: { ...note, parents: ['other-folder'] }, image, ids }), /metadata does not match/);
  assert.throws(() => validateFixtureMetadata({ generation, folder, note, image: undefined, ids }), /metadata does not match/);
  assert.throws(() => validateFixtureMetadata({ generation, folder, note, image, ids: { ...ids, imageId: null } }), /IDs are incomplete/);
  assert.throws(() => validateFixtureMetadata({ generation, folder, note, image: { ...image, appProperties: { fusenSpike: 'other-generation' } }, ids }), /metadata does not match/);
});

test('the full eight-operation B fixture has stable conflict, revocation, and quarantine diagnostics', () => {
  const accountSubject = 'synthetic-account';
  const generation = 'generation-1';
  const root = 'root:synthetic-note';
  const make = (operationId, parents, text, extra = {}) => {
    const operation = {
      ...scope,
      accountSubject,
      noteId: 'synthetic-note',
      shareGeneration: generation,
      operationId,
      parentOperationIds: parents,
      payload: { text },
      imageManifest: [],
      ...extra,
      payloadHashVersion: 2,
    };
    operation.payloadHash = payloadHash(operation);
    return operation;
  };
  const records = [
    make('A', [root], 'Windows edit'),
    make('B', [root], 'late Web edit'),
    make('C', ['A'], 'Windows local edit'),
    make('R', ['B', 'C'], 'chosen resolution', { resolvedOperationIds: ['B', 'C'] }),
    make('late-E', ['B'], 'old branch child'),
    make('ACK-A', ['A'], 'ack', { recordType: 'windows-ack', acknowledgedOperationIds: ['A'] }),
    make('REVOKE', [root], 'revoke', { recordType: 'share-revocation', nextShareGeneration: 'generation-2' }),
    make('delayed-old', [root], 'delayed old generation'),
  ];
  const noteRecords = records.filter(record => !['ACK-A', 'REVOKE', 'delayed-old'].includes(record.operationId));
  const forward = evaluate(noteRecords, scope);
  const reverse = evaluate([...noteRecords].reverse(), scope);
  const activeGeneration = activeShareGeneration(records, generation, { accountSubject, noteId: 'synthetic-note' });
  const delayed = evaluate(records.filter(record => record.operationId === 'delayed-old'), { ...scope, shareGeneration: activeGeneration });
  assert.deepEqual(forward.heads, ['R']);
  assert.ok(forward.rejected.some(item => item.operationId === 'late-E' && item.reason === 'late-child-of-resolved-branch'));
  assert.deepEqual(reverse, forward);
  assert.equal(activeGeneration, 'generation-2');
  assert.deepEqual(delayed.heads, []);
  assert.equal(delayed.rejected[0].reason, 'scope-or-generation-mismatch');
  assert.equal(hasExactOperationIds(deduplicate(records), new Set(['A', 'B', 'C', 'R', 'late-E', 'ACK-A', 'REVOKE', 'delayed-old'])), true);
});

test('active generation is derived from stored revocation records', () => {
  const revocation = op('REVOKE', ['root:0'], 'revoke', {
    recordType: 'share-revocation',
    nextShareGeneration: 'generation-2',
  });
  const stale = op('late-old', ['root:0'], 'late', { shareGeneration: 'generation-1' });
  assert.equal(activeShareGeneration([revocation, stale], 'generation-1', scope), 'generation-2');
  const afterRevoke = evaluate([stale], { ...scope, shareGeneration: activeShareGeneration([revocation, stale], 'generation-1', scope) });
  assert.deepEqual(afterRevoke.heads, []);
  assert.equal(afterRevoke.rejected[0].reason, 'scope-or-generation-mismatch');
});

test('capacity failure never reports ACK, revoke, or resolution complete; same record can retry', async () => {
  const operation = op('critical', ['root:0']);
  let full = true;
  const storage = { async save() { if (full) throw new Error('capacity limit'); } };
  for (const action of ['ACK', 'revoke', 'resolution']) {
    const pending = await saveCriticalRecord(storage, { ...operation, payload: { action } });
    assert.equal(pending.complete, false, `${action} must remain pending`);
    assert.equal(pending.retryable, true);
  }
  full = false;
  const retried = await saveCriticalRecord(storage, operation);
  assert.equal(retried.complete, true);
  assert.equal(retried.operationId, operation.operationId);
});

test('saved operation with a lost response is safely retried once by stable operationId', async () => {
  const operation = op('response-lost', ['root:0']);
  const saved = new Map();
  let loseFirstResponse = true;
  const storage = {
    async save(id, value) {
      const existing = saved.get(id);
      if (existing && payloadHash(existing) !== payloadHash(value)) throw new Error('idempotency conflict');
      if (!existing) saved.set(id, value);
      if (loseFirstResponse) {
        loseFirstResponse = false;
        throw new Error('response lost after durable save');
      }
    },
  };
  const first = await saveCriticalRecord(storage, operation);
  const retry = await saveCriticalRecord(storage, operation);
  assert.equal(first.complete, false);
  assert.equal(retry.complete, true);
  assert.equal(deduplicate([...saved.values()]).length, 1);
});
