import { expect, test } from '@playwright/test';
import { normalizeSnapshotOperation, type ShareSnapshot } from '../lib/web-share-snapshot';
import type { ShareOperation } from '../lib/web-share-contract';

test('PCの順序だけの変更をWebへ反映し、取得失敗時も前回順と本文を保持する',async({page},info)=>{
  const account='order-fixture@example.test',pc='11111111-1111-4111-8111-111111111111';
  const documents=new Map<string,ShareSnapshot>();
  for(const note of ['a','z']) {
    const operation=await normalizeSnapshotOperation({scope:{accountSubject:account,noteId:note,generation:1},operationId:`op-${note}`,kind:'edit',parents:[],resolvedIds:[],payloadHash:'',payload:{title:note.toUpperCase(),markdown:`本文${note.toUpperCase()}`,images:[]}} as ShareOperation);
    documents.set(`snapshot-${note}`,{schemaVersion:2,operation,paused:false,revoked:false,sharingId:'sharing',published:true,pending:null,mutationId:'',gcNonce:'',managedImageOwners:[`snapshot-${note}`],supersededBy:null,absorbedSnapshots:{},conflicts:[],cleanup:[],images:{}});
  }
  let sequence=['z','a'],fail=false,writes=0;
  await page.addInitScript(()=>{localStorage.setItem('viewer_access_token','order-test-token');localStorage.setItem('viewer_expires_at',String(Date.now()+3600_000));});
  await page.route('https://www.googleapis.com/**',async route=>{
    const request=route.request(),url=new URL(request.url()),id=url.pathname.split('/').pop()!;
    const json=(value:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
    if(request.method()!=='GET'){writes++;return json({},500);}
    if(url.pathname.endsWith('/about'))return json({user:{emailAddress:account}});
    if(url.pathname.endsWith('/files')){
      const q=url.searchParams.get('q')??'';
      if(q.includes("name='ore-no-fusen'"))return json({files:[{id:'root'}]});
      if(q.includes("name='web-share-temp'"))return json({files:[{id:'share'}]});
      return json({files:[...documents.keys()].map(id=>({id,name:`op-state-${id.slice(9)}.json`,version:'1'})).concat([{id:'order',name:`web-order-${pc}.json`,version:'1'}])});
    }
    if(id==='order') {
      if(fail)return json({},503);
      if(url.searchParams.get('alt')==='media')return json({schemaVersion:1,accountSubject:account,pcId:pc,name:'PC',entries:sequence.map(noteId=>({noteId,generation:1}))});
      return json({etag:'order-etag',parents:[{id:'share'}],fileSize:'1000'});
    }
    if(documents.has(id))return url.searchParams.get('alt')==='media'?json(documents.get(id)):json({etag:'note-etag',parents:[{id:'share'}],fileSize:'1000'});
    return json({},404);
  });
  await page.setViewportSize({width:1000,height:800});await page.goto('/shared');
  const rows=page.getByRole('navigation',{name:'付箋一覧'}).getByRole('button');
  await expect(rows.first()).toContainText('Z');await rows.first().click();await expect(page.getByRole('article')).toContainText('本文Z');
  sequence=['a','z'];await page.getByRole('button',{name:'Webを更新',exact:true}).click();await expect(rows.first()).toContainText('A');
  await expect(page.getByRole('article')).toContainText('本文Z');
  fail=true;await page.getByRole('button',{name:'Webを更新',exact:true}).click();
  await expect(page.getByText(/一部のPCの表示順を取得できません/)).toBeVisible();await expect(rows.first()).toContainText('A');
  await expect(page.getByRole('article')).toContainText('本文Z');expect(writes).toBe(0);
  await page.screenshot({path:info.outputPath('launcher-order-retained.png')});
});
