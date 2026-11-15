import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateLocalCandidate } from './local-validation.mjs';
function fixture(t) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'candidate-receipt-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'node_modules'));fs.writeFileSync(path.join(root,'node_modules/.package-lock.json'),'locked');
 const state={tree:'tree-a',calls:[],fail:false};
 const m={root,dataDir:path.join(root,'my'),git:async()=>state.tree,head:async()=> 'sha',clean:async()=>{},log:()=>{},cmd:async(c,a)=>{if(c==='rustc'||(c==='cargo'&&a[0]==='--version'))return c+'-version';state.calls.push([c,a]);if(state.fail)throw Error('test failure');}};
 return {m,state};
}
test('同じtree・環境・依存の合格結果は再実行しない',async t=>{const {m,state}=fixture(t);await validateLocalCandidate(m,'sha');assert.equal(state.calls.length,8);await validateLocalCandidate(m,'sha');assert.equal(state.calls.length,8);});
test('候補treeかインストール済み依存が変われば検査し直す',async t=>{const {m,state}=fixture(t);await validateLocalCandidate(m,'sha');state.tree='tree-b';await validateLocalCandidate(m,'sha');assert.equal(state.calls.length,16);fs.writeFileSync(path.join(m.root,'node_modules/.package-lock.json'),'changed');await validateLocalCandidate(m,'sha');assert.equal(state.calls.length,24);});
test('失敗は合格記録を作らず再開時も成功扱いにしない',async t=>{const {m,state}=fixture(t);state.fail=true;await assert.rejects(validateLocalCandidate(m,'sha'),/test failure/);state.fail=false;await validateLocalCandidate(m,'sha');assert.equal(state.calls.length,9);});
test('検証中に候補headが変わったら合格にしない',async t=>{const {m}=fixture(t);m.head=async()=> 'changed';await assert.rejects(validateLocalCandidate(m,'sha'),/候補が変わりました/);});

test('環境設定・導入済みファイルが変われば旧合格を引き継がない',async t=>{
 const {m,state}=fixture(t);await validateLocalCandidate(m,'sha');
 fs.writeFileSync(path.join(m.root,'.env.local'),'TEST=changed');
 await assert.rejects(validateLocalCandidate(m,'sha',{verifyOnly:true}),/環境が変わりました/);
 await validateLocalCandidate(m,'sha');assert.equal(state.calls.length,16);
 fs.writeFileSync(path.join(m.root,'node_modules/changed.js'),'changed');
 await assert.rejects(validateLocalCandidate(m,'sha',{verifyOnly:true}),/環境が変わりました/);
});
