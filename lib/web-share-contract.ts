import {
  calculateSharePayloadHash,
  type ShareHashInput,
} from './web-share-payload-hash';

export type ShareScope = Pick<ShareHashInput, 'accountSubject' | 'noteId' | 'generation'>;
export type ShareOperation = {
  scope: ShareScope;
  kind: ShareHashInput['kind'];
  parents: string[];
  resolvedIds: string[];
  payload: ShareHashInput['payload'];
  operationId: string;
  payloadHash: string;
};

export type ValidatedShareLog = {
  rootId: string;
  contentHeads: string[];
  controlRecords: string[];
};

export class ShareLogValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShareLogValidationError';
  }
}

const contentKinds = new Set(['edit', 'resolve']);
const allKinds = new Set(['edit', 'resolve', 'acknowledge', 'revoke']);
const u32Max = 0xffff_ffff;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ShareLogValidationError(message);
}

function objectValue(value: unknown, field: string): Record<string, unknown> {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${field} must be an object`);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, field: string): string {
  assert(typeof value === 'string', `${field} must be a string`);
  assert(isWellFormedUtf16(value), `${field} contains invalid UTF-16`);
  return value;
}

function u32Value(value: unknown, field: string, allowZero = true): number {
  assert(typeof value === 'number' && Number.isInteger(value) && value >= (allowZero ? 0 : 1) && value <= u32Max,
    `${field} must be a ${allowZero ? 'u32' : 'positive u32'}`);
  return value;
}

function stringArray(value: unknown, field: string): string[] {
  assert(Array.isArray(value), `${field} must be an array`);
  return value.map((item, index) => stringValue(item, `${field}[${index}]`));
}

/** Parses the nested JSON shape serialized by Rust/serde before any log validation. */
export function parseShareOperation(value: unknown): ShareOperation {
  const raw = objectValue(value, 'operation');
  const scope = objectValue(raw.scope, 'scope');
  const payload = objectValue(raw.payload, 'payload');
  const rawImages = payload.images === undefined ? [] : payload.images;
  assert(Array.isArray(rawImages), 'payload.images must be an array');
  const images = rawImages.map((entry, index) => {
    const image = objectValue(entry, `payload.images[${index}]`);
    return {
      imageId: stringValue(image.imageId, `payload.images[${index}].imageId`),
      mimeType: stringValue(image.mimeType, `payload.images[${index}].mimeType`),
      sizeBytes: u32Value(image.sizeBytes, `payload.images[${index}].sizeBytes`, false),
      sha256: stringValue(image.sha256, `payload.images[${index}].sha256`),
    };
  });
  const schemaVersion = payload.schemaVersion === undefined ? 1 : u32Value(payload.schemaVersion, 'payload.schemaVersion', false);
  assert(schemaVersion === 1 || schemaVersion === 2, 'payload.schemaVersion is unsupported');
  const backgroundColor = payload.backgroundColor === undefined || payload.backgroundColor === null
    ? undefined
    : stringValue(payload.backgroundColor, 'payload.backgroundColor');
  const tags = payload.tags === undefined ? [] : stringArray(payload.tags, 'payload.tags');
  if (schemaVersion === 2 && backgroundColor !== undefined) {
    assert(['#f7e9b0', '#ffcdd2', '#80d8ff', '#fafaf0', '#cfd8dc'].includes(backgroundColor), 'payload.backgroundColor is invalid');
  }
  if (schemaVersion === 1) assert(backgroundColor === undefined && tags.length === 0, 'display metadata requires payload schema 2');
  const kind = stringValue(raw.kind, 'kind');
  assert(allKinds.has(kind), 'kind is invalid');
  const resolvedIds = raw.resolvedIds === undefined ? [] : stringArray(raw.resolvedIds, 'resolvedIds');
  return {
    scope: {
      accountSubject: stringValue(scope.accountSubject, 'scope.accountSubject'),
      noteId: stringValue(scope.noteId, 'scope.noteId'),
      generation: u32Value(scope.generation, 'scope.generation'),
    },
    operationId: stringValue(raw.operationId, 'operationId'),
    kind: kind as ShareOperation['kind'],
    parents: stringArray(raw.parents, 'parents'),
    payloadHash: stringValue(raw.payloadHash, 'payloadHash'),
    payload: {
      schemaVersion: schemaVersion as 1 | 2,
      title: stringValue(payload.title, 'payload.title'),
      markdown: stringValue(payload.markdown, 'payload.markdown'),
      images,
      backgroundColor,
      tags,
    },
    resolvedIds,
  };
}

/** Validates untrusted JSON records in the Rust wire shape without applying them. */
export async function validateShareLogJson(
  expected: ShareScope,
  records: unknown[],
): Promise<ValidatedShareLog> {
  assert(Array.isArray(records), 'records must be an array');
  return validateShareLog(expected, records.map(parseShareOperation));
}

function sorted(values: string[]): string[] {
  return [...values].sort((a, b) => {
    const left = new TextEncoder().encode(a);
    const right = new TextEncoder().encode(b);
    const size = Math.min(left.length, right.length);
    for (let index = 0; index < size; index += 1) {
      if (left[index] !== right[index]) return left[index] - right[index];
    }
    return left.length - right.length;
  });
}

function rootFor(scope: ShareScope): string {
  const encoder = new TextEncoder();
  return `root:${encoder.encode(scope.accountSubject).length}:${scope.accountSubject}:${encoder.encode(scope.noteId).length}:${scope.noteId}:${scope.generation}`;
}

function sameLogicalOperation(a: ShareOperation, b: ShareOperation): boolean {
  const sortImages = (record: ShareOperation) => [...record.payload.images]
    .sort((x, y) => compareUtf8(x.imageId, y.imageId))
    .map(({ imageId, mimeType, sizeBytes, sha256 }) => [imageId, mimeType, sizeBytes, sha256]);
  return a.scope.accountSubject === b.scope.accountSubject && a.scope.noteId === b.scope.noteId &&
    a.scope.generation === b.scope.generation && a.kind === b.kind &&
    JSON.stringify(sorted(a.parents)) === JSON.stringify(sorted(b.parents)) &&
    JSON.stringify(sorted(a.resolvedIds)) === JSON.stringify(sorted(b.resolvedIds)) &&
    a.payloadHash === b.payloadHash && a.payload.title === b.payload.title &&
    a.payload.markdown === b.payload.markdown &&
    a.payload.schemaVersion === b.payload.schemaVersion &&
    a.payload.backgroundColor === b.payload.backgroundColor &&
    JSON.stringify(sorted(a.payload.tags ?? [])) === JSON.stringify(sorted(b.payload.tags ?? [])) &&
    JSON.stringify(sortImages(a)) === JSON.stringify(sortImages(b));
}

function compareUtf8(a: string, b: string): number {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  const size = Math.min(left.length, right.length);
  for (let index = 0; index < size; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
}

/** Validates a fully fetched operation set without applying it to a note or writing to Drive. */
export async function validateShareLog(
  expected: ShareScope,
  records: ShareOperation[],
): Promise<ValidatedShareLog> {
  assert(expected.accountSubject.trim() && expected.noteId.trim(), 'Invalid scope');
  const rootId = rootFor(expected);
  const byId = new Map<string, ShareOperation>();
  const controlRecords: string[] = [];

  for (const record of records) {
    assert(record.scope?.accountSubject === expected.accountSubject && record.scope?.noteId === expected.noteId &&
      record.scope?.generation === expected.generation, `Wrong scope: ${record.operationId}`);
    assert(typeof record.operationId === 'string' && record.operationId.trim(), 'Empty operation ID');
    assert(isWellFormedUtf16(record.operationId), `Invalid operation ID: ${record.operationId}`);
    assert(record.operationId !== rootId && !record.operationId.startsWith('root:'),
      `Reserved root ID: ${record.operationId}`);
    assert(allKinds.has(record.kind), `Invalid kind: ${record.operationId}`);
    assert(typeof record.payloadHash === 'string' && record.payloadHash.trim(),
      `Empty payload hash: ${record.operationId}`);
    try {
      assert(record.payloadHash === await calculateSharePayloadHash({
        ...record.scope,
        kind: record.kind,
        parents: record.parents,
        resolvedIds: record.resolvedIds,
        payload: record.payload,
      }),
        `Payload hash mismatch: ${record.operationId}`);
    } catch (error) {
      if (error instanceof ShareLogValidationError) throw error;
      throw new ShareLogValidationError(`Invalid payload: ${record.operationId}`);
    }
    const existing = byId.get(record.operationId);
    if (existing) {
      assert(sameLogicalOperation(existing, record), `Duplicate ID with different payload: ${record.operationId}`);
    } else {
      byId.set(record.operationId, record);
    }
    if (!contentKinds.has(record.kind)) controlRecords.push(record.operationId);
  }

  const unique = [...byId.values()];
  for (const record of unique) {
    const isContent = contentKinds.has(record.kind);
    assert(Array.isArray(record.parents) && Array.isArray(record.resolvedIds), `Invalid operation arrays: ${record.operationId}`);
    if (isContent) assert(record.parents.length > 0, `Content operation has no parent: ${record.operationId}`);
    if (record.kind === 'edit') assert(record.parents.length === 1, `Edit must have one parent: ${record.operationId}`);
    for (const parentId of record.parents) {
      if (parentId === rootId) {
        assert(record.kind === 'edit' && record.parents.length === 1, `Invalid root parent: ${record.operationId}`);
        continue;
      }
      const parent = byId.get(parentId);
      assert(parent, `Missing parent ${parentId}: ${record.operationId}`);
      assert(contentKinds.has(parent.kind), `Control record used as parent: ${record.operationId}`);
    }
    for (const resolvedId of record.resolvedIds) {
      const resolved = byId.get(resolvedId);
      assert(record.parents.includes(resolvedId) && resolved && contentKinds.has(resolved.kind),
        `Invalid resolved ID ${resolvedId}: ${record.operationId}`);
    }
    if (record.kind === 'resolve') {
      const parents = sorted(record.parents);
      const resolved = sorted(record.resolvedIds);
      assert(parents.length >= 2 && new Set(parents).size === parents.length &&
        new Set(resolved).size === resolved.length &&
        JSON.stringify(parents) === JSON.stringify(resolved),
      `Resolution must name every distinct parent: ${record.operationId}`);
    } else {
      assert(record.resolvedIds.length === 0, `Only resolve may name resolved IDs: ${record.operationId}`);
    }
  }

  const content = new Map(unique.filter((record) => contentKinds.has(record.kind))
    .map((record) => [record.operationId, record]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    assert(!visiting.has(id), 'Cycle in share log');
    visiting.add(id);
    for (const parent of content.get(id)?.parents ?? []) {
      if (parent !== rootId) visit(parent);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of content.keys()) visit(id);

  const hasChild = new Set<string>();
  for (const record of content.values()) {
    for (const parent of record.parents) if (parent !== rootId) hasChild.add(parent);
  }
  const contentHeads = sorted([...content.keys()].filter((id) => !hasChild.has(id)));
  return { rootId, contentHeads, controlRecords: sorted([...new Set(controlRecords)]) };
}

function isWellFormedUtf16(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}
