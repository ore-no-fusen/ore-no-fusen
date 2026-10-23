import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { normalizeSnapshotOperation, type ShareSnapshot } from '../lib/web-share-snapshot';
import type { ShareOperation } from '../lib/web-share-contract';

test('検証Drive画面で画像の遅延取得・本文だけの保存・下書き復元を確認する',async({page},info)=>{
  test.setTimeout(90_000);
  const account='storage-fixture@example.test';
  const jpeg=readFileSync('public/screenshots/ScreenShot_OreNoFusen-lcp.jpg');
  const previewHash=createHash('sha256').update(jpeg).digest('hex');
  const sourceHash='a'.repeat(64);
  const manifest={imageId:`img-${sourceHash}`,sha256:sourceHash,mimeType:'image/png',sizeBytes:500_000};
  async function state(note:string,images:boolean):Promise<ShareSnapshot> {
    const operation=await normalizeSnapshotOperation({scope:{accountSubject:account,noteId:note,generation:1},operationId:`op-${note}`,kind:'edit',parents:[],resolvedIds:[],payloadHash:'',payload:{title:images?'資源利用性の確認（検証データ）':'画像のない付箋（検証データ）',markdown:images?`- [ ] 本文だけの保存確認\n\n![Web用プレビュー](ore-fusen-image://img-${sourceHash})\n\n${'確認用の本文\n\n'.repeat(70)}![画面外の画像](ore-fusen-image://img-${sourceHash})`:'画像のない本文',images:images?[manifest]:[]}} as ShareOperation);
    return {schemaVersion:2,operation,paused:false,revoked:false,sharingId:'sharing',published:true,pending:null,mutationId:'',gcNonce:'',managedImageOwners:[`snapshot-${note}`],supersededBy:null,absorbedSnapshots:{},conflicts:[],cleanup:[],images:images?{[sourceHash]:{fileId:'preview-file',sourceSha256:sourceHash,sha256:previewHash,mimeType:'image/jpeg',sizeBytes:jpeg.length,width:1200,height:675,legacy:false}}:{}};
  }
  const documents=new Map([['snapshot-photo',await state('photo',true)],['snapshot-text',await state('text',false)]]);
  let version=1,imageReads=0,lists=0,puts=0;
  await page.addInitScript(()=>{
    localStorage.setItem('viewer_access_token','test-fixture-token');localStorage.setItem('viewer_expires_at',String(Date.now()+3600_000));
    const active=new Set<string>();const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
    URL.createObjectURL=(blob:Blob)=>{const url=create(blob);active.add(url);return url;};
    URL.revokeObjectURL=(url:string)=>{active.delete(url);revoke(url);};
    Object.defineProperty(window,'fixtureActiveImageUrls',{get:()=>active.size});
  });
  await page.route('https://www.googleapis.com/**',async route=>{
    const request=route.request(),url=new URL(request.url());
    const json=(body:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(url.pathname.endsWith('/about')) return json({user:{emailAddress:account}});
    if(url.pathname.endsWith('/files')) {
      const q=url.searchParams.get('q')??'';
      if(q.includes("name='ore-no-fusen'")) return json({files:[{id:'root'}]});
      if(q.includes("name='web-share-temp'")) return json({files:[{id:'share'}]});
      lists++;
      return json({files:[...documents.keys()].map(id=>({id,name:`op-state-${id.slice(9)}.json`,version:String(version)}))});
    }
    const id=url.pathname.split('/').pop()!;
    if(id==='preview-file') {imageReads++;return route.fulfill({status:200,contentType:'image/jpeg',body:jpeg});}
    const document=documents.get(id);if(!document) return json({},404);
    if(request.method()==='PUT') {
      if(request.headers()['if-match']!==`"${version}"`) return json({},412);
      const next=request.postDataJSON() as ShareSnapshot;
      expect(next.images).toEqual(document.images);documents.set(id,next);version++;puts++;return json({});
    }
    if(url.searchParams.get('alt')==='media') return json(document);
    return json({etag:`"${version}"`,parents:[{id:'share'}],fileSize:String(JSON.stringify(document).length)});
  });
  await page.setViewportSize({width:1280,height:900});
  await page.goto('/shared');
  await page.getByRole('button',{name:/資源利用性の確認/}).click();
  await expect(page.getByRole('img',{name:'Web用プレビュー'})).toBeVisible();
  expect(imageReads).toBe(1); // The second occurrence is far outside the viewport.
  const initialLists=lists;
  await page.screenshot({path:info.outputPath('01-visible-preview.png')});
  await page.getByRole('checkbox',{name:'本文だけの保存確認'}).click();
  await expect(page.getByText('チェックを保存しました。Windowsには「Webと同期」で反映します。')).toBeVisible();
  expect(puts).toBe(1);expect(lists).toBe(initialLists);expect(imageReads).toBe(1);
  await page.screenshot({path:info.outputPath('02-text-only-save.png')});
  await page.getByRole('button',{name:'編集',exact:true}).click();
  await page.getByRole('textbox',{name:'付箋本文'}).fill('再読込しても残る未送信の本文（検証データ）');
  await page.reload();
  await expect(page.getByRole('textbox',{name:'付箋本文'})).toHaveValue('再読込しても残る未送信の本文（検証データ）');
  await page.screenshot({path:info.outputPath('03-restored-draft.png')});
  await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'fixtureActiveImageUrls'))).toBe(0);
  await page.evaluate(()=>sessionStorage.clear());
  await page.reload();
  await page.getByRole('button',{name:/資源利用性の確認/}).click();
  await page.getByText('別のタブ・前回の未送信下書き（1件）',{exact:true}).click();
  await page.getByRole('button',{name:'この下書きを復元',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'付箋本文'})).toHaveValue('再読込しても残る未送信の本文（検証データ）');
  await expect(page.getByText('別のタブ・前回の未送信下書き（1件）',{exact:true})).toHaveCount(0);
  await page.screenshot({path:info.outputPath('04-closed-tab-recovered.png')});
  expect(puts).toBe(1);
});
