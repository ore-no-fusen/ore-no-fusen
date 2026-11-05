import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync, crc32 } from 'node:zlib';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { auditReuse, eligiblePush, matchesProof, readReceiptZip, findProof, TTL_MS, parentsFromCommit, assertCleanInputs } from './ci-validation-reuse.mjs';

test('receipt refuses changed tracked and unknown inputs while allowing ignored generated output',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'validation-inputs-'));
 const git=(...args)=>execFileSync('git',['-c','user.name=Validation fixture','-c','user.email=fixture@example.invalid','-c','core.hooksPath=disabled-hooks','-c','commit.gpgsign=false',...args],{cwd:folder,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 try {
  git('init','--quiet');fs.writeFileSync(path.join(folder,'.gitignore'),'generated.map\n');
  fs.writeFileSync(path.join(folder,'source.ts'),'original');git('add','.');git('commit','--quiet','-m','base');
  fs.writeFileSync(path.join(folder,'generated.map'),'generated');assert.doesNotThrow(()=>assertCleanInputs(folder));
  fs.writeFileSync(path.join(folder,'source.ts'),'changed');assert.throws(()=>assertCleanInputs(folder),/Tracked.*source.ts/);
  git('add','source.ts');assert.throws(()=>assertCleanInputs(folder),/Tracked.*source.ts/);
  git('restore','--staged','--worktree','source.ts');
  fs.writeFileSync(path.join(folder,'unknown.ts'),'unknown');assert.throws(()=>assertCleanInputs(folder),/Untracked.*unknown.ts/);
  fs.unlinkSync(path.join(folder,'unknown.ts'));git('add','-f','generated.map');git('commit','--quiet','-m','tracked generation fixture');
  fs.writeFileSync(path.join(folder,'generated.map'),'regenerated');assert.throws(()=>assertCleanInputs(folder),/Tracked.*generated.map/);
  git('rm','--cached','-f','generated.map');git('commit','--quiet','-m','untrack generated output');assert.doesNotThrow(()=>assertCleanInputs(folder));
 } finally { if(path.resolve(folder).startsWith(path.join(os.tmpdir(),'validation-inputs-')))fs.rmSync(folder,{recursive:true,force:true}); }
});

const A='a'.repeat(40), B='b'.repeat(40), C='c'.repeat(40), T='d'.repeat(40), P='e'.repeat(40);
const now=Date.parse('2026-10-28T01:00:00Z');
test('depth-one checkout still exposes the real merge parents through raw headers',()=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'validation-shallow-'));
 const source=path.join(temporary,'source'),clone=path.join(temporary,'clone');fs.mkdirSync(source);
 const git=(cwd,...args)=>execFileSync('git',['-c','user.name=Validation fixture','-c','user.email=fixture@example.invalid','-c','core.hooksPath=disabled-hooks','-c','commit.gpgsign=false',...args],{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 try{
  git(source,'init','--quiet','-b','main');fs.writeFileSync(path.join(source,'a'),'a');git(source,'add','a');git(source,'commit','--quiet','-m','base');
  git(source,'checkout','--quiet','-b','feature');fs.writeFileSync(path.join(source,'b'),'b');git(source,'add','b');git(source,'commit','--quiet','-m','feature');
  git(source,'checkout','--quiet','main');git(source,'merge','--quiet','--no-ff','feature','-m','merge');
  const expected=parentsFromCommit(git(source,'cat-file','-p','HEAD'));assert.equal(expected.length,2);
  git(temporary,'clone','--quiet','--depth=1',pathToFileURL(source).href,clone);
  assert.equal(git(clone,'show','-s','--format=%P','HEAD'),'');
  assert.deepEqual(parentsFromCommit(git(clone,'cat-file','-p','HEAD')),expected);
 }finally{if(path.resolve(temporary).startsWith(path.join(os.tmpdir(),'validation-shallow-')))fs.rmSync(temporary,{recursive:true,force:true});}
});
const fixture=()=>{
 const environment={platform:'win32',arch:'x64',node:'v24.22.1',image:'20261020.1',imageOS:'win25',settings:'abc'};
 const context={suite:'frontend',event:'push',ref:'refs/heads/develop',attempt:1,force:false,commit:C,tree:T,parents:[A,B],before:A,repository:'owner/repo',environment};
 const pr={number:7,merged:true,merged_at:'2026-10-28T00:10:00Z',merge_commit_sha:C,base:{ref:'develop',sha:A,repo:{full_name:'owner/repo'}},head:{ref:'feature',sha:B,repo:{full_name:'owner/repo'}}};
 const run={id:123,run_attempt:1,event:'pull_request',status:'completed',conclusion:'success',path:'.github/workflows/test.yml',head_sha:B,head_branch:'feature',head_repository:{full_name:'owner/repo'},pull_requests:[{number:7}]};
 const proof={schema:1,mode:'executed',result:'success',suite:'frontend',repository:'owner/repo',pr:7,base:A,head:B,testedCommit:P,tree:T,parents:[A,B],run:123,attempt:1,environment,createdAt:new Date(now-1000).toISOString()};
 const artifact={id:456,name:'validation-frontend-123-1',expired:false,expires_at:new Date(now+TTL_MS).toISOString(),digest:'sha256:'+'f'.repeat(64),workflow_run:{id:123}};
 return {context,pr,run,proof,artifact};
};
function zip(name,object,method=8){
 const data=Buffer.from(JSON.stringify(object)), compressed=method===8?deflateRawSync(data):data, filename=Buffer.from(name);
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(method,8);local.writeUInt32LE(crc32(data),14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(filename.length,26);
 const directory=Buffer.alloc(46);directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(method,10);directory.writeUInt32LE(crc32(data),16);directory.writeUInt32LE(compressed.length,20);directory.writeUInt32LE(data.length,24);directory.writeUInt16LE(filename.length,28);
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(directory.length+filename.length,12);end.writeUInt32LE(local.length+filename.length+compressed.length,16);
 return Buffer.concat([local,filename,compressed,directory,filename,end]);
}
test('a successful same-repository PR validates the exact merge tree, parents and environment',()=>{
 const f=fixture();assert.equal(matchesProof(f.proof,f.context,f.pr,f.run,f.artifact,now),true);
});
test('merged PRs can have an empty API pull_requests array without losing the receipt binding',async()=>{
 const f=fixture();f.run.pull_requests=[];const api=apiFixture(f);
 assert.equal((await findProof(f.context,api)).proof.pr,7);
 f.run.head_branch='other';assert.equal(await findProof(f.context,api),null);
});
test('never reuse PR/manual/main/retry/force/direct-push runs',()=>{
 for(const patch of [{event:'pull_request'},{event:'workflow_dispatch'},{ref:'refs/heads/main'},{attempt:2},{force:true},{before:B},{parents:[A]},{parents:[A,B,P]},{commit:'bad'}])assert.equal(eligiblePush({...fixture().context,...patch}),false,JSON.stringify(patch));
});
test('changed content, base, head, image, Node or settings require actual checks',()=>{
 for(const mutate of [f=>f.context.tree=A,f=>f.context.parents=[P,B],f=>f.context.parents=[A,P],f=>f.context.environment={...f.context.environment,image:'changed'},f=>f.context.environment={...f.context.environment,node:'v25.0.0'},f=>f.context.environment={...f.context.environment,settings:'changed'},f=>f.context.environment={...f.context.environment,image:''}]){const f=fixture();mutate(f);assert.equal(matchesProof(f.proof,f.context,f.pr,f.run,f.artifact,now),false);}
});
test('failed, cancelled, missing, foreign or stale evidence is never success',()=>{
 const mutations=[f=>f.proof.result='failure',f=>f.proof.mode='reused',f=>f.proof.suite='rust',f=>f.proof.repository='foreign/repo',f=>f.proof.testedCommit='bad',f=>f.proof.base=P,f=>f.proof.head=P,f=>f.proof.pr=8,f=>f.proof.parents=[B,A],f=>f.proof.run=124,f=>f.proof.attempt=2,f=>f.proof.createdAt=new Date(now-TTL_MS).toISOString(),f=>f.proof.createdAt=new Date(now+1).toISOString(),f=>f.proof.createdAt='bad',f=>f.pr.merged=false,f=>f.pr.merge_commit_sha=P,f=>f.pr.head.repo.full_name='fork/repo',f=>f.pr.base.repo.full_name='fork/repo',f=>f.run.status='in_progress',f=>f.run.conclusion='failure',f=>f.run.conclusion='cancelled',f=>f.run.conclusion='skipped',f=>f.run.path='.github/workflows/fake.yml',f=>f.run.head_sha=P,f=>f.run.head_repository.full_name='fork/repo',f=>f.run.pull_requests=[{number:8}],f=>f.artifact.expired=true,f=>f.artifact.expires_at='bad',f=>f.artifact.expires_at=new Date(now).toISOString(),f=>f.artifact.name='wrong',f=>delete f.artifact.digest,f=>f.artifact.workflow_run.id=124];
 for(const mutate of mutations){const f=fixture();mutate(f);assert.equal(matchesProof(f.proof,f.context,f.pr,f.run,f.artifact,now),false,mutate.toString());}
});
test('bounded ZIP reader accepts normal stored/deflated receipts and refuses other paths',()=>{
 const proof=fixture().proof;
 for(const method of [0,8])assert.deepEqual(readReceiptZip(zip('frontend.json',proof,method),'frontend.json'),proof);
 const descriptor=zip('frontend.json',proof);const central=descriptor.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));
 descriptor.writeUInt16LE(8,6);descriptor.writeUInt16LE(8,central+8);descriptor.fill(0,14,26);
 assert.deepEqual(readReceiptZip(descriptor,'frontend.json'),proof);
 for(const name of ['../frontend.json','msix.json','folder/frontend.json'])assert.throws(()=>readReceiptZip(zip(name,proof),'frontend.json'));
 assert.throws(()=>readReceiptZip(Buffer.alloc(0),'frontend.json'));
 assert.throws(()=>readReceiptZip(Buffer.alloc(3*1024*1024),'frontend.json'));
 assert.throws(()=>readReceiptZip(zip('frontend.json',{x:'x'.repeat(70000)}),'frontend.json'));
 const damaged=zip('frontend.json',proof,0);damaged[45]^=1;assert.throws(()=>readReceiptZip(damaged,'frontend.json'));
});
function apiFixture(f){
 const archive=zip('frontend.json',f.proof);f.artifact.digest='sha256:'+createHash('sha256').update(archive).digest('hex');
 const calls=[];
 const request=async route=>{calls.push(route);if(route.startsWith('commits/'))return [f.pr];if(route.startsWith('pulls/'))return f.pr;if(route.startsWith('actions/workflows/'))return {total_count:1,workflow_runs:[f.run]};if(route.endsWith('/artifacts?per_page=100'))return {total_count:1,artifacts:[f.artifact]};if(route==='actions/runs/123')return f.run;throw Error('Unexpected route '+route);};
 return {request,download:async()=>archive,now,calls};
}
test('artifact discovery binds the real successful run and archive digest',async()=>{
 const f=fixture(),api=apiFixture(f);assert.equal((await findProof(f.context,api)).proof.run,123);assert.ok(api.calls.length>=4);
 f.artifact.digest='sha256:'+'0'.repeat(64);assert.equal(await findProof(f.context,api),null);
});
test('latest failed rerun cannot be replaced by an older green run',async()=>{
 const f=fixture(),api=apiFixture(f);f.run.status='in_progress';f.run.conclusion=null;assert.equal(await findProof(f.context,api),null);
});
test('no API lookup for ineligible events; missing evidence falls back to fresh execution',async()=>{
 const f=fixture();assert.equal(await findProof({...f.context,event:'pull_request'},{request:()=>{throw Error('must not call');},download:()=>{}}),null);
 assert.equal(await findProof(f.context,{request:async()=>[],download:()=>{},now}),null);
});

function auditFixture() {
 const f=fixture();
 const needs={frontend:{outputs:{reused:'true',source_run:'123',source_attempt:'1',source_pr:'7'}}};
 return {f,needs,api:apiFixture(f),context:{parents:[A,B],commit:C,repository:'owner/repo'}};
}
test('gate audit accepts the still-successful exact source and skips fresh suites',async()=>{
 const {needs,context,api}=auditFixture();
 await auditReuse(needs,context,{...api,log:()=>{}});
 assert.equal(api.calls.length,3);
 await auditReuse({frontend:{outputs:{reused:'false'}}},context,{request:()=>{throw Error('must not call');}});
});
test('gate audit rejects failed, cancelled, incomplete or rerun source validation',async()=>{
 for(const patch of [{conclusion:'failure'},{conclusion:'cancelled'},{status:'in_progress',conclusion:null},{run_attempt:2}]) {
  const {f,needs,context,api}=auditFixture();Object.assign(f.run,patch);
  await assert.rejects(auditReuse(needs,context,{...api,log:()=>{}}),/no longer successful/);
 }
});
test('gate audit refuses an older green run when a newer failed run exists',async()=>{
 const {f,needs,context,api}=auditFixture();
 const request=async route=>route.startsWith('actions/workflows/')
  ? {total_count:2,workflow_runs:[f.run,{...f.run,id:124,conclusion:'failure'}]}
  : api.request(route);
 await assert.rejects(auditReuse(needs,context,{request,log:()=>{}}),/no longer successful/);
});
test('gate audit propagates every API failure instead of treating evidence as success',async()=>{
 for(const failing of ['actions/runs/123','actions/workflows/','pulls/7']) {
  const {needs,context,api}=auditFixture();
  const request=async route=>{if(route.startsWith(failing))throw Error('API unavailable');return api.request(route);};
  await assert.rejects(auditReuse(needs,context,{request,log:()=>{}}),/API unavailable/);
 }
});
