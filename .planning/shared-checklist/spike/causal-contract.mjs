// Pure local model for the Drive operation-log feasibility tests.
// It makes no network calls and does not touch product code or Drive files.
import { createHash } from 'node:crypto';

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function legacyPayloadHash(operation) {
  const identity = {
    accountSubject: operation.accountSubject,
    noteId: operation.noteId,
    shareGeneration: operation.shareGeneration,
    parentOperationIds: [...(operation.parentOperationIds || [])].sort(),
    payload: operation.payload,
    imageManifest: operation.imageManifest || [],
  };
  return createHash('sha256').update(canonical(identity)).digest('hex');
}

export function payloadHash(operation) {
  const identity = {
    accountSubject: operation.accountSubject,
    noteId: operation.noteId,
    shareGeneration: operation.shareGeneration,
    parentOperationIds: [...(operation.parentOperationIds || [])].sort(),
    resolvedOperationIds: [...(operation.resolvedOperationIds || [])].sort(),
    acknowledgedOperationIds: [...(operation.acknowledgedOperationIds || [])].sort(),
    recordType: operation.recordType || null,
    nextShareGeneration: operation.nextShareGeneration || null,
    payload: operation.payload,
    imageManifest: operation.imageManifest || [],
  };
  return createHash('sha256').update(canonical(identity)).digest('hex');
}

export function deduplicate(operations) {
  const unique = new Map();
  for (const operation of operations) {
    const hash = payloadHash(operation);
    if (operation.payloadHashVersion && operation.payloadHashVersion !== 2) throw new Error(`unsupported payloadHashVersion: ${operation.operationId}`);
    const storedHash = operation.payloadHashVersion === 2 ? hash : legacyPayloadHash(operation);
    if (operation.payloadHash && operation.payloadHash !== storedHash) throw new Error(`payloadHash mismatch: ${operation.operationId}`);
    const existing = unique.get(operation.operationId);
    if (existing && existing.hash !== hash) throw new Error(`operationId collision: ${operation.operationId}`);
    if (!existing) unique.set(operation.operationId, { operation, hash });
  }
  return [...unique.values()].map(item => item.operation);
}

export function hasExactOperationIds(operations, expectedIds) {
  const actualIds = new Set(operations.map(operation => operation.operationId));
  return actualIds.size === expectedIds.size && [...expectedIds].every(id => actualIds.has(id));
}

export function validateFixtureMetadata({ generation, folder, note, image, ids }) {
  if (!generation || !ids?.folderId || !ids?.noteId || !ids?.imageId) {
    throw new Error('saved fixture IDs are incomplete');
  }
  const validFile = (file, { id, name, mimeType, parentId }) => Boolean(file
    && file.id === id
    && file.name === name
    && file.mimeType === mimeType
    && file.trashed !== true
    && (!parentId || (file.parents || []).includes(parentId))
    && file.appProperties?.fusenSpike === generation);
  if (!validFile(folder, {
    id: ids.folderId,
    name: `全付箋補完計画-API検証-${generation.slice(0, 8)}`,
    mimeType: 'application/vnd.google-apps.folder',
    parentId: null,
  }) || !validFile(note, {
    id: ids.noteId,
    name: '検証メモ.json',
    mimeType: 'application/json',
    parentId: ids.folderId,
  }) || !validFile(image, {
    id: ids.imageId,
    name: '検証画像.png',
    mimeType: 'image/png',
    parentId: ids.folderId,
  })) {
    throw new Error('saved fixture metadata does not match the dedicated test folder');
  }
  return true;
}

export function activeShareGeneration(operations, initialGeneration, { accountSubject, noteId }) {
  const unique = deduplicate(operations);
  let generation = initialGeneration;
  const visited = new Set();
  while (true) {
    if (visited.has(generation)) throw new Error(`share-generation cycle: ${generation}`);
    visited.add(generation);
    const next = new Set(unique
      .filter(operation => operation.accountSubject === accountSubject
        && operation.noteId === noteId
        && operation.shareGeneration === generation
        && operation.recordType === 'share-revocation')
      .map(operation => operation.nextShareGeneration)
      .filter(value => typeof value === 'string' && value.length > 0));
    if (next.size > 1) throw new Error(`conflicting share revocations: ${generation}`);
    if (next.size === 0) return generation;
    generation = [...next][0];
  }
}

function ancestorsOf(id, byId, seen = new Set()) {
  if (seen.has(id)) return seen;
  seen.add(id);
  for (const parentId of byId.get(id)?.parentOperationIds || []) ancestorsOf(parentId, byId, seen);
  return seen;
}

function findCycleIds(operations) {
  const byId = new Map(operations.map(operation => [operation.operationId, operation]));
  const state = new Map();
  const stack = [];
  const cycles = new Set();
  function visit(id) {
    state.set(id, 1);
    stack.push(id);
    for (const parentId of byId.get(id)?.parentOperationIds || []) {
      if (!byId.has(parentId)) continue;
      if (!state.has(parentId)) visit(parentId);
      else if (state.get(parentId) === 1) {
        const start = stack.lastIndexOf(parentId);
        for (const cycleId of stack.slice(start)) cycles.add(cycleId);
      }
    }
    stack.pop();
    state.set(id, 2);
  }
  for (const id of byId.keys()) if (!state.has(id)) visit(id);
  return cycles;
}

export function evaluate(operations, { accountSubject, noteId, shareGeneration, allPagesRead = true, availableImageIds }) {
  if (!allPagesRead) return { complete: false, heads: [], rejected: [{ operationId: null, reason: 'incomplete-pagination' }] };
  const unique = deduplicate(operations);
  const byId = new Map(unique.map(op => [op.operationId, op]));
  const rejected = [];
  let candidates = unique.filter(op => {
    if (op.accountSubject !== accountSubject || op.noteId !== noteId || op.shareGeneration !== shareGeneration) {
      rejected.push({ operationId: op.operationId, reason: 'scope-or-generation-mismatch' });
      return false;
    }
    const parents = new Set(op.parentOperationIds || []);
    const unresolvedResolution = (op.resolvedOperationIds || []).some(id => !parents.has(id));
    if (unresolvedResolution) {
      rejected.push({ operationId: op.operationId, reason: 'resolution-omits-parent' });
      return false;
    }
    return true;
  });
  const cycleIds = findCycleIds(candidates);
  if (cycleIds.size) {
    for (const operationId of cycleIds) rejected.push({ operationId, reason: 'cyclic-parent-graph' });
    candidates = candidates.filter(operation => !cycleIds.has(operation.operationId));
  }
  let changed = true;
  while (changed) {
    changed = false;
    const candidateIds = new Set(candidates.map(op => op.operationId));
    candidates = candidates.filter(op => {
      const missingParent = (op.parentOperationIds || []).some(parentId => !candidateIds.has(parentId) && !parentId.startsWith('root:'));
      const missingImage = availableImageIds !== undefined && (op.imageManifest || []).some(image => !availableImageIds.has(image.id || image.imageId));
      if (missingParent || missingImage) {
        rejected.push({ operationId: op.operationId, reason: missingParent ? 'missing-parent' : 'missing-image' });
        changed = true;
        return false;
      }
      return true;
    });
  }
  const scoped = new Map(candidates.map(op => [op.operationId, op]));
  const resolutions = candidates.filter(op => op.resolvedOperationIds?.length);
  const quarantined = new Set();
  for (const resolution of resolutions) {
    const branches = resolution.resolvedOperationIds.map(id => ancestorsOf(id, scoped));
    if (branches.some(branch => !scoped.has([...branch][0]) && !byId.has([...branch][0]))) continue;
    const sharedAncestors = new Set([...branches[0]].filter(id => branches.every(branch => branch.has(id))));
    const branchNodes = new Set(branches.flatMap(branch => [...branch].filter(id => !sharedAncestors.has(id))));
    const resolutionAncestors = ancestorsOf(resolution.operationId, scoped);
    for (const operation of candidates) {
      if (operation.operationId === resolution.operationId || resolutionAncestors.has(operation.operationId)) continue;
      if ((operation.parentOperationIds || []).some(parentId => branchNodes.has(parentId))) quarantined.add(operation.operationId);
    }
  }
  for (const operationId of quarantined) rejected.push({ operationId, reason: 'late-child-of-resolved-branch' });
  let quarantineChanged = true;
  while (quarantineChanged) {
    quarantineChanged = false;
    for (const operation of candidates) {
      if (quarantined.has(operation.operationId)) continue;
      if ((operation.parentOperationIds || []).some(parentId => quarantined.has(parentId))) {
        quarantined.add(operation.operationId);
        rejected.push({ operationId: operation.operationId, reason: 'descendant-of-quarantined-branch' });
        quarantineChanged = true;
      }
    }
  }
  const active = candidates.filter(op => !quarantined.has(op.operationId));
  const parentIds = new Set(active.flatMap(op => op.parentOperationIds || []));
  const heads = active.filter(op => !parentIds.has(op.operationId));
  const headIds = heads.map(op => op.operationId).sort();
  rejected.sort((left, right) => `${left.operationId ?? ''}:${left.reason}`.localeCompare(`${right.operationId ?? ''}:${right.reason}`));
  return { complete: rejected.length === 0 && headIds.length <= 1, heads: headIds, rejected };
}

export async function saveCriticalRecord(storage, operation) {
  try {
    await storage.save(operation.operationId, operation);
    return { complete: true, operationId: operation.operationId };
  } catch (error) {
    return { complete: false, retryable: true, operationId: operation.operationId, reason: error.message };
  }
}
