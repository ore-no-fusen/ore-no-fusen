/** Validate JPEG dimensions before letting the browser allocate decoded pixels. */
export function verifyPreviewDimensions(bytes:Uint8Array,width:number,height:number):void {
  if(bytes.length<4 || bytes[0]!==0xff || bytes[1]!==0xd8) throw new Error('Web用画像の形式が不正です');
  let offset=2;
  while(offset+3<bytes.length) {
    if(bytes[offset++]!==0xff) break;
    while(bytes[offset]===0xff) offset++;
    const marker=bytes[offset++];
    if(marker===0xd9 || marker===0xda) break;
    if(marker===0x01 || (marker>=0xd0 && marker<=0xd7)) continue;
    const length=(bytes[offset]<<8)|bytes[offset+1];
    if(length<2 || offset+length>bytes.length) break;
    if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      if(length<8) break;
      const actualHeight=(bytes[offset+3]<<8)|bytes[offset+4];
      const actualWidth=(bytes[offset+5]<<8)|bytes[offset+6];
      if(actualWidth===width && actualHeight===height && width>0 && height>0 && width<=1600 && height<=1600) return;
      break;
    }
    offset+=length;
  }
  throw new Error('Web用画像の画素数を確認できません');
}
