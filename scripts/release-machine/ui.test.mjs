import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from './server.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require=createRequire(import.meta.url);const {chromium}=require('@playwright/test');
test('two-button browser flow, fixed confirmation, command logs, narrow screen and blocked state',async t=>{
  const state={status:'idle',steps:{}};let busy=false;
  const info={root:'D:\\開発\\俺の付箋',version:'5.6.1',branch:'develop',changes:[],mainChanges:[],mainRoot:null,state,dataDir:'D:\\開発\\俺の付箋\\my\\release-machine',platform:'win32',log:''};
  const machine={inspect:async()=>({...info,busy}),start:(kind,input)=>{
    if(busy)throw new Error('busy');busy=true;
    if(kind==='prepare') {Object.assign(state,{id:'fixture',version:input.version,operation:kind,status:'running',current:'STEP 1-2 本番ビルド中',steps:{build:{status:'running',started:new Date().toISOString(),title:'本番ビルド'}}});info.log='> powershell.exe -File windows.ps1 -Action Build\n→ npx.cmd tauri build --no-bundle';setTimeout(()=>{Object.assign(state,{status:'confirm',current:'STEP 1-5 実機確認待ち'});state.steps.build.status='done';state.steps.build.seconds=2;state.steps.install={status:'done',seconds:1};busy=false;},1200);}
    else {assert.equal(input.confirmed,true);Object.assign(state,{operation:kind,status:'complete',current:'Store提出準備完了',destination:'D:\\提出\\5.6.2\\ore-no-fusen.msix'});info.log+='\n> build-msix.ps1\n✓ 内部exe一致\n✓ main / develop反映';busy=false;}
  }};
  const token='browser-test';const port=await new Promise(resolve=>{const temp=createServer(machine,{token,port:0});temp.listen(0,'127.0.0.1',()=>{const p=temp.address().port;temp.close(()=>resolve(p));});});
  const server=createServer(machine,{token,port});await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true});t.after(async()=>{await browser.close();await new Promise(resolve=>server.close(resolve));});
  const page=await browser.newPage({viewport:{width:1024,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/#${token}`);await page.waitForFunction(()=>!document.querySelector('#prepare').disabled);
  assert.equal(await page.locator('button').count(),2);assert.equal(await page.locator('input[type=checkbox]').count(),1);
  assert.match(await page.locator('.premise').innerText(),/developへマージ済み/);
  assert.equal(await page.locator('#package').isDisabled(),true);
  await page.locator('#prepare').click();await page.waitForFunction(()=>document.querySelector('#current').textContent.includes('確認待ち'));
  assert.equal(await page.locator('#package').isDisabled(),true);await page.locator('#confirmed').check();assert.equal(await page.locator('#package').isEnabled(),true);
  assert.match(await page.locator('#log').innerText(),/powershell.exe/);
  const output=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../my/release-machine-ui-check');fs.mkdirSync(output,{recursive:true});
  await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});
  await page.setViewportSize({width:360,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(output,'narrow.png'),fullPage:true});
  await page.locator('#package').click();await page.waitForFunction(()=>!document.querySelector('#complete').hidden);assert.match(await page.locator('#destination').innerText(),/5.6.2/);
  info.changes=['unrelated.txt'];Object.assign(state,{status:'idle',steps:{},id:null});await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('unrelated.txt'));assert.equal(await page.locator('#prepare').isDisabled(),true);
  assert.deepEqual(errors,[]);
});
