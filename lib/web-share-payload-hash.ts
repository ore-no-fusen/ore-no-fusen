export type ShareOperationKind = 'edit' | 'resolve' | 'acknowledge' | 'revoke';

export type ShareImageManifest = {
  imageId: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
};

export type SharePayload = {
  schemaVersion?: 1 | 2;
  title: string;
  markdown: string;
  images: ShareImageManifest[];
  backgroundColor?: string | null;
  tags?: string[];
};

export type ShareHashInput = {
  accountSubject: string;
  noteId: string;
  generation: number;
  kind: ShareOperationKind;
  parents: string[];
  resolvedIds: string[];
  payload: SharePayload;
};

const encoder = new TextEncoder();
const u32Max = 0xffff_ffff;
const kindCode: Record<ShareOperationKind, number> = {
  edit: 1,
  resolve: 2,
  acknowledge: 3,
  revoke: 4,
};

function assertU32(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0 || value > u32Max) {
    throw new Error(`${field} must be a u32`);
  }
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
}

function compareUtf8(a: string, b: string): number {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  const common = Math.min(left.length, right.length);
  for (let i = 0; i < common; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return left.length - right.length;
}

class ByteWriter {
  private readonly chunks: Uint8Array[] = [];

  u8(value: number): void {
    this.chunks.push(Uint8Array.of(value));
  }

  raw(value: string): void {
    this.chunks.push(encoder.encode(value));
  }

  u32(value: number, field: string): void {
    assertU32(value, field);
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value, false);
    this.chunks.push(bytes);
  }

  string(value: string, field: string): void {
    assertString(value, field);
    if (!isWellFormedUtf16(value)) {
      throw new Error(`${field} contains invalid UTF-16`);
    }
    const bytes = encoder.encode(value);
    this.u32(bytes.length, `${field} byte length`);
    this.chunks.push(bytes);
  }

  strings(values: string[], field: string): void {
    if (!Array.isArray(values)) throw new Error(`${field} must be an array`);
    values.forEach((value) => assertString(value, field));
    const sorted = [...values].sort(compareUtf8);
    this.u32(sorted.length, `${field} count`);
    sorted.forEach((value) => this.string(value, field));
  }

  finish(): Uint8Array {
    const length = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
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

/** Hash contract shared with src-tauri/src/web_share_contract.rs. */
export async function calculateSharePayloadHash(input: ShareHashInput): Promise<string> {
  if (!input || typeof input !== 'object') throw new Error('input must be an object');
  assertString(input.accountSubject, 'accountSubject');
  assertString(input.noteId, 'noteId');
  if (!Object.hasOwn(kindCode, input.kind)) throw new Error('Invalid operation kind');
  assertU32(input.generation, 'generation');
  if (!input.payload || typeof input.payload !== 'object') throw new Error('payload must be an object');
  assertString(input.payload.title, 'title');
  assertString(input.payload.markdown, 'markdown');
  const schemaVersion = input.payload.schemaVersion ?? 1;
  if (schemaVersion !== 1 && schemaVersion !== 2) throw new Error('Unsupported payload schema');
  const backgroundColor = input.payload.backgroundColor ?? '';
  const tags = input.payload.tags ?? [];
  if (schemaVersion === 2 && input.payload.backgroundColor != null && !['#f7e9b0', '#ffcdd2', '#80d8ff', '#fafaf0', '#cfd8dc'].includes(backgroundColor)) {
    throw new Error('Invalid background color');
  }
  if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string')) throw new Error('Invalid tags');
  const seenTags = new Set<string>();
  if (tags.length > 64 || tags.some((tag) => {
    const normalized = tag.trim().toLowerCase();
    const invalid = !tag.trim() || tag.trim() !== tag || encoder.encode(tag).length > 256 ||
      /[\u0000-\u001f\u007f-\u009f]/.test(tag) ||
      ['recipe', 'link', 'term', 'qa', 'shortcut'].includes(normalized) || seenTags.has(normalized);
    seenTags.add(normalized);
    return invalid;
  })) {
    throw new Error('Invalid tags');
  }
  if (schemaVersion === 1 && (input.payload.backgroundColor != null || tags.length)) throw new Error('Display metadata requires payload schema 2');
  if (!Array.isArray(input.parents) || !Array.isArray(input.resolvedIds) || !Array.isArray(input.payload.images)) {
    throw new Error('operation arrays are invalid');
  }
  input.parents.forEach((value) => assertString(value, 'parent ID'));
  input.resolvedIds.forEach((value) => assertString(value, 'resolved ID'));
  const images = [...input.payload.images].sort((a, b) => compareUtf8(a.imageId, b.imageId));
  const imageIds = new Set<string>();
  for (const image of images) {
    if (!image || typeof image !== 'object') throw new Error('Invalid image manifest');
    assertString(image.imageId, 'imageId');
    assertString(image.mimeType, 'mimeType');
    assertString(image.sha256, 'image sha256');
    if (
      !image.imageId.trim() || imageIds.has(image.imageId) || !image.mimeType.trim() ||
      !Number.isInteger(image.sizeBytes) || image.sizeBytes <= 0 || image.sizeBytes > u32Max ||
      !/^[0-9a-f]{64}$/.test(image.sha256)
    ) {
      throw new Error('Invalid image manifest');
    }
    imageIds.add(image.imageId);
  }

  const writer = new ByteWriter();
  writer.raw(schemaVersion === 1 ? 'ore-no-fusen-share-v1\0' : 'ore-no-fusen-share-v2\0');
  writer.string(input.accountSubject, 'accountSubject');
  writer.string(input.noteId, 'noteId');
  writer.u32(input.generation, 'generation');
  writer.u8(kindCode[input.kind]);
  writer.strings(input.parents, 'parents');
  writer.strings(input.resolvedIds, 'resolvedIds');
  writer.string(input.payload.title, 'title');
  writer.string(input.payload.markdown, 'markdown');
  writer.u32(images.length, 'images count');
  for (const image of images) {
    writer.string(image.imageId, 'imageId');
    writer.string(image.mimeType, 'mimeType');
    writer.u32(image.sizeBytes, 'image sizeBytes');
    writer.string(image.sha256, 'image sha256');
  }
  if (schemaVersion === 2) {
    writer.string(backgroundColor, 'backgroundColor');
    writer.strings(tags, 'tags');
  }

  const data = writer.finish();
  const ownedBuffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(ownedBuffer).set(data);
  const digest = await crypto.subtle.digest('SHA-256', ownedBuffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
