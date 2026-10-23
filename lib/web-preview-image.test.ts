import { describe, expect, it } from 'vitest';
import { verifyPreviewDimensions } from './web-preview-image';
const header=(width:number,height:number)=>new Uint8Array([255,216,255,192,0,11,8,height>>8,height&255,width>>8,width&255,1,1,17,0,255,217]);
describe('preview allocation boundary',()=>{
  it('accepts exact small dimensions before browser decoding',()=>{expect(()=>verifyPreviewDimensions(header(1600,800),1600,800)).not.toThrow();});
  it('rejects truncated, oversized and falsely declared images',()=>{
    expect(()=>verifyPreviewDimensions(header(65535,65535),1600,800)).toThrow();
    expect(()=>verifyPreviewDimensions(header(1600,800),800,400)).toThrow();
    expect(()=>verifyPreviewDimensions(header(1600,800).slice(0,8),1600,800)).toThrow();
    expect(()=>verifyPreviewDimensions(new Uint8Array(),1,1)).toThrow();
  });
});
