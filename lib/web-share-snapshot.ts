import { parseShareOperation, validateShareLogJson, type ShareOperation } from './web-share-contract';
import { calculateSharePayloadHash } from './web-share-payload-hash';

export const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;
export const MAX_SHARE_ACCOUNT_BYTES = 512 * 1024 * 1024;
export type PreviewAsset = {fileId:string;sourceSha256:string;sha256:string;mimeType:string;sizeBytes:number;width:number;height:number;legacy:boolean};
export type ShareSnapshot = {
  schemaVersion: 2;
  operation: ShareOperation;
  paused: boolean;
  revoked: boolean;
  sharingId: string;
  images: Record<string, PreviewAsset>;
  published: boolean;
  pending: {mutationId:string;ownerPc:string;expiresAt:number;assets:Record<string,PreviewAsset>} | null;
  mutationId:string;
  gcNonce:string;
  managedImageOwners:string[];
  supersededBy:string|null;
  absorbedSnapshots:Record<string,string>;
  conflicts: ShareOperation[];
  cleanup: { id: string; digest: string }[];
};
export type SnapshotRef = { fileId: string; etag: string; value: ShareSnapshot };
export function snapshotBytes(value: ShareSnapshot): number { return new TextEncoder().encode(JSON.stringify(value)).length; }
export function snapshotRoot(operation: ShareOperation): string {
  const scope = operation.scope;
  const size = (s: string) => new TextEncoder().encode(s).length;
  return `root:${size(scope.accountSubject)}:${scope.accountSubject}:${size(scope.noteId)}:${scope.noteId}:${scope.generation}`;
}
export async function normalizeSnapshotOperation(operation: ShareOperation): Promise<ShareOperation> {
  const result: ShareOperation = { ...operation, kind: 'edit', parents: [snapshotRoot(operation)], resolvedIds: [], payloadHash: '' };
  result.payloadHash = await calculateSharePayloadHash({ ...result.scope, ...result });
  return result;
}
export async function parseShareSnapshot(raw: unknown, account: string): Promise<ShareSnapshot> {
  if (!raw || typeof raw !== 'object') throw new Error('共有状態を読み取れません。');
  const value = raw as ShareSnapshot;
  if (value.schemaVersion !== 2 || typeof value.published !== 'boolean' || typeof value.mutationId !== 'string' || typeof value.gcNonce !== 'string' || typeof value.paused !== 'boolean' || typeof value.revoked !== 'boolean' ||
      typeof value.sharingId !== 'string' || !value.sharingId || !value.images || typeof value.images !== 'object' || Array.isArray(value.images) ||
      !Array.isArray(value.conflicts) || !Array.isArray(value.cleanup) || snapshotBytes(value) > MAX_SNAPSHOT_BYTES) throw new Error('共有状態の形式または容量が不正です。');
  if (!Array.isArray(value.managedImageOwners) || !value.managedImageOwners.length || value.managedImageOwners.some(id=>typeof id!=='string' || !/^[A-Za-z0-9_-]+$/.test(id)) || (value.supersededBy!==null && (typeof value.supersededBy!=='string' || !/^[A-Za-z0-9_-]+$/.test(value.supersededBy)))) throw new Error('共有画像の管理範囲が不正です。');
  if(!value.absorbedSnapshots || typeof value.absorbedSnapshots!=='object' || Array.isArray(value.absorbedSnapshots) || Object.entries(value.absorbedSnapshots).some(([id,hash])=>!/^[A-Za-z0-9_-]+$/.test(id) || typeof hash!=='string' || !/^[a-f0-9]{64}$/.test(hash))) throw new Error('共有状態の保全証拠が不正です。');
  const expected = new Map<string, number>();
  for (const rawOperation of [value.operation, ...value.conflicts]) {
    const operation = parseShareOperation(rawOperation);
    if (operation.scope.accountSubject !== account || operation.scope.generation !== 1 ||
        operation.scope.noteId !== value.operation.scope.noteId || operation.kind !== 'edit' ||
        operation.parents.length !== 1 || operation.parents[0] !== snapshotRoot(operation)) throw new Error('共有状態の基準が一致しません。');
    await validateShareLogJson(operation.scope, [operation]);
    for (const image of operation.payload.images) {
      if (image.sizeBytes > 50 * 1024 * 1024 || !image.sizeBytes) throw new Error('共有画像の容量が不正です。');
      if (expected.has(image.sha256) && expected.get(image.sha256) !== image.sizeBytes) throw new Error('共有画像のサイズが一致しません。');
      expected.set(image.sha256, image.sizeBytes);
    }
  }
  if (Object.keys(value.images).length !== expected.size) throw new Error('共有画像の参照が一致しません。');
  for (const [hash, size] of expected) {
    validatePreviewAsset(value.images[hash],hash);
    if (value.images[hash].legacy && value.images[hash].sizeBytes !== size) throw new Error('旧画像のサイズが一致しません。');
  }
  if (value.pending !== null) {
    const pending=value.pending;
    if (!pending || !/^[0-9a-f-]{36}$/.test(pending.mutationId) || typeof pending.ownerPc!=='string' || !pending.ownerPc || !Number.isSafeInteger(pending.expiresAt) || !pending.assets || typeof pending.assets!=='object' || Array.isArray(pending.assets)) throw new Error('画像予約が不正です。');
    for (const [hash,asset] of Object.entries(pending.assets)) {validatePreviewAsset(asset,hash);if(asset.legacy) throw new Error('旧画像を新規予約しません。');}
  }
  if (value.cleanup.some(item => !item || typeof item.id !== 'string' || !item.id || !/^[a-f0-9]{64}$/.test(item.digest))) throw new Error('共有記録の整理情報が不正です。');
  return value;
}
export function validatePreviewAsset(asset:PreviewAsset,source:string):void {
  if (!asset || typeof asset.fileId!=='string' || !asset.fileId || !/^[a-f0-9]{64}$/.test(source) || asset.sourceSha256!==source || !/^[a-f0-9]{64}$/.test(asset.sha256) || typeof asset.legacy!=='boolean' || !Number.isSafeInteger(asset.sizeBytes) || asset.sizeBytes<1) throw new Error('Web画像の識別情報が不正です。');
  if (asset.legacy) {
    if(asset.sizeBytes>50*1024*1024 || asset.sha256!==source || !['image/jpeg','image/png','image/gif','image/bmp','image/webp'].includes(asset.mimeType)) throw new Error('旧画像の識別情報が不正です。');
  } else if (asset.sizeBytes>1024*1024 || asset.mimeType!=='image/jpeg' || !Number.isInteger(asset.width) || !Number.isInteger(asset.height) || asset.width<1 || asset.height<1 || asset.width>1600 || asset.height>1600) throw new Error('Web画像の容量または画素数が不正です。');
}
