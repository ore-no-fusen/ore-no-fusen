import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runPrecommit } from './precommit.mjs';
import { classifyChangedFiles } from './precommit-classify.mjs';

test('content-only documents omit app tests; executable/dependency/mixed paths do not',()=>{
 for(const files of [['docs/a.md'],['docs-v2/a.md','public-guide/help.png']])assert.equal(classifyChangedFiles(files),'skip');
 for(const files of [[],['docs/tool.mjs'],['docs-v2/package-lock.json'],['docs/a.md','app/page.tsx'],['app/page.tsx','docs/a.md']])assert.equal(classifyChangedFiles(files),'run');
});
test('commit checks diff without rerunning app tests',()=>{
 for(const file of ['app/page.tsx','components/ui/button.tsx','src-tauri/src/lib.rs']){
  const calls=[];runPrecommit([file],(cmd,args)=>calls.push([cmd,...args]),()=>{});
  assert.deepEqual(calls,[['git','diff','--cached','--check']]);
 }
});

test('other changes and documents only run the local diff check',()=>{
 for(const file of ['scripts/tool.mjs','docs/a.md','docs-v2/package-lock.json','app/viewer/page.tsx']){
  const calls=[];runPrecommit([file],(cmd,args)=>calls.push([cmd,...args]),()=>{});
  assert.deepEqual(calls,[['git','diff','--cached','--check']]);
 }
});
test('diff failure stops the hook',()=>{
 assert.throws(()=>runPrecommit(['app/page.tsx'],()=>{throw Error('diff failed');},()=>{}));
});

test('actual hook keeps the restricted version guard and calls the tested entry',()=>{
 const hook=fs.readFileSync('.husky/pre-commit','utf8');
 assert.match(hook,/RELEASE_MACHINE_VERSION_COMMIT/);assert.match(hook,/check-version-commit\.mjs/);
 assert.match(hook,/node scripts\/precommit\.mjs/);assert.doesNotMatch(hook,/npm test|tsc --noEmit|HUSKY=0/);
});
