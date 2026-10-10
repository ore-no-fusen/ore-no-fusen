import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRunner } from './runner.mjs';

test('real Windows SDK: pack from preserved files; validate SHA256/version/extra-resource failure', { skip: process.platform !== 'win32' }, async t => {
  const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'release-machine-sdk-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const scripts=path.join(root,'packaging/msix');fs.mkdirSync(scripts,{recursive:true});
  for(const name of ['build-msix.ps1','validate-msix.ps1'])fs.writeFileSync(path.join(scripts,name),'\ufeff'+fs.readFileSync(path.join(source,'packaging/msix',name),'utf8').replace(/^\ufeff/,''));
  fs.copyFileSync(path.join(source,'packaging/msix/AppxManifest.xml'),path.join(scripts,'AppxManifest.xml'));
  fs.mkdirSync(path.join(root,'src-tauri/icons'),{recursive:true});
  for(const name of ['StoreLogo.png','Square44x44Logo.png','Square71x71Logo.png','Square150x150Logo.png','Square310x310Logo.png'])fs.copyFileSync(path.join(source,'src-tauri/icons',name),path.join(root,'src-tauri/icons',name));
  const preserved=path.join(root,'preserved');fs.mkdirSync(path.join(preserved,'resources'),{recursive:true});
  // A Windows-provided executable fixture is never installed or launched.
  fs.copyFileSync(path.join(process.env.WINDIR,'System32/notepad.exe'),path.join(preserved,'ore-no-fusen.exe'));
  fs.writeFileSync(path.join(preserved,'resources/test.txt'),'resource');
  const run=createRunner();const ps=async(script,args)=>{let output='';try{return await run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(scripts,script),...args],{cwd:root,onOutput:line=>{output+=line;}});}catch(error){throw new Error(`${error.message}\n${output}`);}};
  await ps('build-msix.ps1',['-ReleaseDirectory',preserved]);
  const packagePath=path.join(scripts,'out/ore-no-fusen.msix');
  const version=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8')).version+'.0';
  const args=['-PackagePath',packagePath,'-ExpectedVersion',version,'-ExpectedReleaseDirectory',preserved];
  assert.match(await ps('validate-msix.ps1',args),/SHA256 match/);
  await assert.rejects(ps('validate-msix.ps1',['-PackagePath',packagePath,'-ExpectedVersion','99.0.0.0']));
  fs.writeFileSync(path.join(preserved,'resources/test.txt'),'changed');await assert.rejects(ps('validate-msix.ps1',args));
  fs.writeFileSync(path.join(preserved,'resources/test.txt'),'resource');fs.unlinkSync(path.join(preserved,'resources/test.txt'));await assert.rejects(ps('validate-msix.ps1',args));
});
