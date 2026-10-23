import { describe, expect, it } from 'vitest';
import { normalizeSnapshotOperation, parseShareSnapshot, validatePreviewAsset, type ShareSnapshot, type PreviewAsset } from './web-share-snapshot';
import type { ShareOperation } from './web-share-contract';

const hash='a'.repeat(64);
const asset:PreviewAsset={fileId:'drive-image',sourceSha256:hash,sha256:'b'.repeat(64),mimeType:'image/jpeg',sizeBytes:123,width:1600,height:800,legacy:false};
async function snapshot():Promise<ShareSnapshot> {
  const operation=await normalizeSnapshotOperation({scope:{accountSubject:'test@example.test',noteId:'note',generation:1},operationId:'edit',kind:'edit',parents:[],resolvedIds:[],payloadHash:'',payload:{title:'写真',markdown:`![写真](ore-fusen-image://img-${hash})`,images:[{imageId:`img-${hash}`,sha256:hash,mimeType:'image/png',sizeBytes:9999}]}} as ShareOperation);
  return {schemaVersion:2,operation,paused:false,revoked:false,sharingId:'sharing',images:{[hash]:{...asset}},published:true,pending:null,mutationId:'',gcNonce:'',managedImageOwners:['owner'],supersededBy:null,absorbedSnapshots:{},conflicts:[],cleanup:[]};
}
describe('bounded snapshot descriptors',()=>{
  it('keeps original manifests separate from smaller JPEG previews',async()=>{
    const value=await snapshot();expect(await parseShareSnapshot(value,'test@example.test')).toBe(value);
    expect(value.operation.payload.images[0].sha256).toBe(hash);expect(value.images[hash].sha256).not.toBe(hash);
    expect(JSON.stringify(value).length).toBeLessThan(2000);
  });
  it('rejects inline bytes, missing references, foreign accounts and excessive dimensions',async()=>{
    const value=await snapshot();
    await expect(parseShareSnapshot({...value,images:{[hash]:'base64'}},'test@example.test')).rejects.toThrow();
    await expect(parseShareSnapshot({...value,images:{}},'test@example.test')).rejects.toThrow();
    await expect(parseShareSnapshot(value,'other@example.test')).rejects.toThrow();
    expect(()=>validatePreviewAsset({...asset,width:1601},hash)).toThrow();
    expect(()=>validatePreviewAsset({...asset,sizeBytes:1024*1024+1},hash)).toThrow();
  });
  it('preserves a reserved image even when its deadline has passed',async()=>{
    const value=await snapshot();value.pending={mutationId:'11111111-1111-4111-8111-111111111111',ownerPc:'pc',expiresAt:0,assets:{[hash]:asset}};
    expect((await parseShareSnapshot(value,'test@example.test')).pending?.assets[hash].fileId).toBe('drive-image');
  });
});
