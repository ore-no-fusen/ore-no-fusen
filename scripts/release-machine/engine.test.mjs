import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { ReleaseMachine, validateVersion, hashFile, directoryHashes, atomicJSON } from './engine.mjs';
import { createRunner } from './runner.mjs';
import { createServer, acquireLock } from './server.mjs';
import { checkStagedVersionCommit } from './check-version-commit.mjs';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
async function fixture(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'release-machine-test-'));
  const root = path.join(folder, 'basic folder'); fs.mkdirSync(root);
  // All Git writes and pushes in these tests target this disposable fixture.
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
  git('init', '-b', 'main'); git('config','user.name','Release Machine Test'); git('config','user.email','test@example.invalid'); git('config','core.hooksPath',path.join(root,'.fixture-hooks'));
  const files = {
    'package.json':'{\n  "name": "ore-no-fusen",\n  "version": "5.6.1"\n}\n',
    'package-lock.json':'{\n  "version": "5.6.1",\n  "packages": {\n    "": {\n      "name": "ore-no-fusen",\n      "version": "5.6.1"\n    }\n  }\n}\n',
    'src-tauri/Cargo.toml':'[package]\nname = "ore-no-fusen"\nversion = "5.6.1"\n',
    'src-tauri/Cargo.lock':'[[package]]\nname = "ore-no-fusen"\nversion = "5.6.1"\n',
    'packaging/msix/AppxManifest.xml':'<Identity Version="5.6.1.0" />\n',
    '.gitignore':'/my/\n/.w/\n/node_modules/\n/src-tauri/target/\n/packaging/msix/out/\n/packaging/msix/dev/\n',
    'scripts/set-release-version.mjs':fs.readFileSync(path.join(source,'scripts/set-release-version.mjs'),'utf8'),
    'scripts/release-machine/check-version-commit.mjs':fs.readFileSync(path.join(source,'scripts/release-machine/check-version-commit.mjs'),'utf8'),
    '.fixture-hooks/pre-commit':'#!/bin/sh\nif [ "$RELEASE_MACHINE_VERSION_COMMIT" = "1" ]; then\n  node scripts/release-machine/check-version-commit.mjs\n  exit $?\nfi\n',
    'scripts/release-machine/windows.ps1':'# fixture only\n',
    'packaging/msix/test-msix.ps1':'# fixture only\n',
    'packaging/msix/build-msix.ps1':'# fixture only\n',
    'packaging/msix/validate-msix.ps1':'# fixture only\n',
  };
  for (const [file,text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),text); }
  git('add','--',...Object.keys(files));git('commit','-m','fixture');git('checkout','-b','develop');
  const remote=path.join(folder,'remote.git');execFileSync('git',['init','--bare',remote],{stdio:'ignore'});git('remote','add','origin',remote);git('push','origin','main','develop');
  fs.mkdirSync(path.join(root,'node_modules'));
  const config={ history:[], fail:null, installed:null, buildCount:0, pushCount:0 };
  const real=createRunner();
  const runner=async(file,args,options)=>{
    const effectiveArgs=file==='git'&&args[0]==='-c'&&args[1].startsWith('safe.directory=')?args.slice(2):args;
    if(process.env.RELEASE_MACHINE_TEST_TRACE)console.error('TEST command',file,args);
    config.history.push({file,args,cwd:options.cwd});
    if(config.fail?.(file,effectiveArgs,options))throw new Error('injected failure');
    if(file!=='powershell.exe') {if(file==='git'&&effectiveArgs[0]==='push')config.pushCount++;return real(file,args,options);}
    const value=flag=>args[args.indexOf(flag)+1];
    const write=(file,data)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);};
    const action=args.includes('-Action')?value('-Action'):null;
    options.onOutput?.('fixture PowerShell OK\n');
    if(action==='Build') {
      config.buildCount++;
      write(path.join(value('-RepoRoot'),'src-tauri/target/release/ore-no-fusen.exe'),`exe-${value('-ExpectedVersion')}`);
      write(path.join(value('-RepoRoot'),'src-tauri/target/release/resources/test.txt'),'resource');
    } else if(action==='Install') config.installed=directoryHashes(value('-ReleaseDirectory'));
    else if(action==='VerifyInstalled') assert.deepEqual(config.installed,directoryHashes(value('-ReleaseDirectory')));
    else if(!action) {
      const script=path.basename(value('-File'));
      if(script==='test-msix.ps1')write(path.join(options.cwd,'packaging/msix/dev/out/ore-no-fusen-dev.msix'),JSON.stringify(directoryHashes(value('-ReleaseDirectory'))));
      if(script==='build-msix.ps1')write(path.join(options.cwd,'packaging/msix/out/ore-no-fusen.msix'),JSON.stringify(directoryHashes(value('-ReleaseDirectory'))));
      if(script==='validate-msix.ps1')assert.deepEqual(JSON.parse(fs.readFileSync(value('-PackagePath'),'utf8')),directoryHashes(value('-ExpectedReleaseDirectory')));
    }
    return 'fixture OK';
  };
  const options={root,runner,platform:'win32',submissionRoot:path.join(folder,'Store submit')};const machine=new ReleaseMachine(options);
  t.after(()=>{ for(const block of git('worktree','list','--porcelain').split('\n\n')){const line=block.split('\n')[0];const dir=line.slice(9);if(path.resolve(dir)!==path.resolve(root)&&fs.existsSync(dir))git('worktree','remove','--force',dir);}fs.rmSync(folder,{recursive:true,force:true}); });
  return {machine,config,git,root,folder,options};
}
const prepare = machine => machine.start('prepare',{version:'5.6.2'});
const packageRelease = machine => machine.start('package',{version:'5.6.2',confirmed:true});

test('success uses preserved binary even when shared target changes; two branches reflect same candidate',async t=>{
  const f=await fixture(t);await prepare(f.machine);assert.equal(f.machine.state.status,'confirm',f.machine.state.error);
  assert.throws(()=>f.machine.start('package',{version:'5.6.2',confirmed:false}),/チェック/);
  fs.writeFileSync(path.join(f.machine.state.mainRoot,'src-tauri/target/release/ore-no-fusen.exe'),'other build');
  await packageRelease(f.machine);assert.equal(f.machine.state.status,'complete');assert.equal(f.config.buildCount,1);
  assert.equal(f.git('ls-remote','origin','refs/heads/main').split(/\s/)[0],f.machine.state.candidate);
  assert.equal(hashFile(f.machine.state.destination),f.machine.state.storeHash);
  const before=f.machine.state.status;assert.throws(()=>packageRelease(f.machine),/既に完了/);assert.equal(f.machine.state.status,before);
});
test('dirty and staged/untracked changes block before changing any version; logs do not swallow leading status spaces',async t=>{
  const f=await fixture(t);fs.writeFileSync(path.join(f.root,'unrelated.txt'),'keep');await prepare(f.machine);
  assert.equal(f.machine.state.status,'failed');assert.match(f.machine.state.error,/unrelated.txt/);assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,'package.json'))).version,'5.6.1');assert.equal(f.config.buildCount,0);
});
test('wrong branch and diverged main block before version mutation',async t=>{
  const f=await fixture(t);f.git('checkout','main');fs.writeFileSync(path.join(f.root,'main-only.txt'),'main');f.git('add','main-only.txt');f.git('commit','-m','diverge');f.git('checkout','develop');
  await prepare(f.machine);assert.match(f.machine.state.error,/分岐/);assert.equal(f.config.buildCount,0);
});
test('double click is rejected synchronously',async t=>{
  const f=await fixture(t);const job=prepare(f.machine);assert.throws(()=>prepare(f.machine),/二重/);await job;assert.equal(f.config.buildCount,1);
});
test('build failure resumes without an additional version commit',async t=>{
  const f=await fixture(t);f.config.fail=(_,args)=>args.includes('Build');await prepare(f.machine);assert.equal(f.machine.state.status,'failed');const commit=f.git('rev-parse','HEAD');
  f.config.fail=null;await prepare(f.machine);assert.equal(f.machine.state.status,'confirm');assert.equal(f.git('rev-parse','HEAD'),commit);
});
test('commit failure can resume with its own staged version files',async t=>{
  const f=await fixture(t);f.config.fail=(file,args)=>file==='git'&&args[0]==='commit';await prepare(f.machine);assert.equal(f.machine.state.steps.commit.status,'failed');
  f.config.fail=null;await prepare(f.machine);assert.equal(f.machine.state.status,'confirm');
});
test('interrupted commit result is recognized and persisted state resumes after server restart',async t=>{
  const f=await fixture(t);await prepare(f.machine);
  f.machine.state.status='running';f.machine.state.steps.commit.status='running';delete f.machine.state.candidate;
  delete f.machine.state.steps.main;delete f.machine.state.steps.build;delete f.machine.state.steps.dev;delete f.machine.state.steps.install;f.machine.save();
  const restored=new ReleaseMachine(f.options);assert.equal(restored.state.status,'failed');await prepare(restored);assert.equal(restored.state.status,'confirm');
});
test('changed preserved exe blocks Store creation and push',async t=>{
  const f=await fixture(t);await prepare(f.machine);fs.writeFileSync(path.join(f.machine.state.releaseDir,'ore-no-fusen.exe'),'changed');await packageRelease(f.machine);
  assert.equal(f.machine.state.status,'failed');assert.match(f.machine.state.error,/保全済み/);assert.equal(f.config.pushCount,0);
});
test('changed candidate blocks release continuation',async t=>{
  const f=await fixture(t);await prepare(f.machine);fs.writeFileSync(path.join(f.root,'other.txt'),'other');f.git('add','other.txt');f.git('commit','-m','other');await packageRelease(f.machine);
  assert.match(f.machine.state.error,/コミット/);assert.equal(f.config.pushCount,0);
});
test('a different file at fixed destination is retained; no push',async t=>{
  const f=await fixture(t);await prepare(f.machine);const out=path.join(f.options.submissionRoot,'5.6.2','ore-no-fusen.msix');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,'existing');await packageRelease(f.machine);
  assert.match(f.machine.state.error,/上書き/);assert.equal(fs.readFileSync(out,'utf8'),'existing');assert.equal(f.config.pushCount,0);
});
test('partial push retry skips packaging and already successful main push',async t=>{
  const f=await fixture(t);await prepare(f.machine);f.config.fail=(file,args)=>file==='git'&&args[0]==='push'&&args.some(s=>s.endsWith(':refs/heads/develop'));await packageRelease(f.machine);
  assert.equal(f.machine.state.steps['push-main'].status,'done');assert.equal(f.machine.state.status,'failed');
  const packs=f.config.history.filter(h=>h.args.some(s=>s.endsWith('build-msix.ps1'))).length;
  f.config.fail=null;const restored=new ReleaseMachine(f.options);await packageRelease(restored);assert.equal(restored.state.status,'complete');assert.equal(f.config.pushCount,2);
  assert.equal(f.config.history.filter(h=>h.args.some(s=>s.endsWith('build-msix.ps1'))).length,packs);
});
test('validation failure never reaches fixed save or push',async t=>{
  const f=await fixture(t);await prepare(f.machine);f.config.fail=(_,args)=>args.some(s=>s.endsWith('validate-msix.ps1'));await packageRelease(f.machine);
  assert.equal(f.machine.state.status,'failed');assert.equal(f.config.pushCount,0);assert.equal(fs.existsSync(f.options.submissionRoot),false);
});
test('MSIX version bounds and injection strings are rejected',()=>{
  for(const v of ['5.6.1','5.5.9','05.6.2','5.6.65536','0.9.0','5.6.2 & cmd','5.6.2\n'])assert.throws(()=>validateVersion(v,'5.6.1'));
  assert.doesNotThrow(()=>validateVersion('5.6.2','5.6.1'));
});
test('runner redacts secrets split across stream chunks',async()=>{
  const lines=[];await createRunner(['split-secret'])(process.execPath,['-e',"process.stdout.write('split-');setTimeout(()=>process.stdout.write('secret\\n'),20)"],{onOutput:line=>lines.push(line)});
  assert.equal(lines.join(''),'[REDACTED]\n');
});
test('server rejects unauthenticated, cross-origin and wrong-host API calls; read-only mode never executes',async t=>{
  const f=await fixture(t);const token='fixture-token';const port=await new Promise(resolve=>{const server=createServer(f.machine,{token,port:0});server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>resolve(p));});});
  const server=createServer(f.machine,{token,port,readOnly:true});await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${port}`;
  assert.equal((await fetch(`${base}/api/state`)).status,401);
  assert.equal((await fetch(`${base}/api/state`,{headers:{Authorization:`Bearer ${token}`,Origin:'https://evil.invalid'}})).status,403);
  const wrongHost=await new Promise((resolve,reject)=>{const req=http.get(`${base}/api/state`,{headers:{Authorization:`Bearer ${token}`,Host:`evil.invalid:${port}`}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});assert.equal(wrongHost,403);
  assert.equal((await fetch(`${base}/api/prepare`,{method:'POST',headers:{Authorization:`Bearer ${token}`,Origin:base,'Content-Type':'application/json'},body:JSON.stringify({version:'5.6.2'})})).status,403);
  const response=await fetch(`${base}/api/state`,{headers:{Authorization:`Bearer ${token}`}});assert.equal(response.status,200);assert.equal((await response.json()).readOnly,true);assert.equal(f.config.buildCount,0);
});
test('singleton server lock refuses a second live owner',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rm-lock-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'lock');const first=acquireLock(file,{pid:process.pid,token:'a'});const second=acquireLock(file,{pid:process.pid,token:'b'});assert.equal(second.existing.token,'a');first.release();assert.equal(fs.existsSync(file),false);
});
test('version-only hook accepts updater output and rejects staged code changes',async t=>{
  const f=await fixture(t);execFileSync(process.execPath,['scripts/set-release-version.mjs','5.6.2'],{cwd:f.root});
  const files=['package.json','package-lock.json','src-tauri/Cargo.toml','src-tauri/Cargo.lock','packaging/msix/AppxManifest.xml'];f.git('add','--',...files);
  assert.doesNotThrow(()=>checkStagedVersionCommit(f.root));
  fs.appendFileSync(path.join(f.root,'src-tauri/Cargo.toml'),'\n# unrelated change\n');f.git('add','src-tauri/Cargo.toml');assert.throws(()=>checkStagedVersionCommit(f.root),/版番号以外/);
});
test('a live child process after interruption blocks retry without killing it',async t=>{
  const f=await fixture(t);await prepare(f.machine);f.machine.state.childPid=process.pid;f.machine.save();await packageRelease(f.machine);assert.match(f.machine.state.error,/子プロセス/);assert.equal(f.config.pushCount,0);
});

test('inspection does not refresh the Git index while a release commit is pending', async t => {
  const f = await fixture(t);
  const index = path.join(f.root, '.git/index');
  const before = fs.readFileSync(index);
  const file = path.join(f.root, 'package.json');
  const later = new Date(Date.now() + 10000);
  fs.utimesSync(file, later, later);
  assert.deepEqual(await f.machine.changes(), []);
  assert.deepEqual(fs.readFileSync(index), before);
});
