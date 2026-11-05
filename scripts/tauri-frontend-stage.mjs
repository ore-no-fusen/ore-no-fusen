import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createRunner } from './release-machine/runner.mjs';

const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { if(e.code !== 'ESRCH') throw e; return false; } };
function noLinks(folder) {
  if (fs.lstatSync(folder).isSymbolicLink()) throw Error(`Build input/output is a link: ${folder}`);
  if (fs.statSync(folder).isDirectory()) for (const name of fs.readdirSync(folder)) noLinks(path.join(folder,name));
}
function inside(base, file) { const rel=path.relative(base,file); return rel && !rel.startsWith('..') && !path.isAbsolute(rel); }
function atomic(file,value) { const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(value));fs.renameSync(temp,file); }
export function recoverLegacy(root, base) {
  const parks=fs.readdirSync(root).filter(name=>/^\.tauri-build-api-\d+$/.test(name));
  const restores=new Map();
  for(const park of parks) {
    if(alive(Number(park.split('-').at(-1)))) throw Error(`Legacy build owner is alive: ${park}`);
    const folder=path.join(root,park);noLinks(folder);
    for(const entry of fs.readdirSync(folder,{recursive:true,withFileTypes:true}).filter(e=>e.isFile())) {
      const from=path.join(entry.parentPath,entry.name), rel=path.relative(folder,from);
      if(entry.name!=='route.ts' || !inside(folder,from)) throw Error(`Unknown legacy build file: ${rel}`);
      const to=path.join(root,'app/api',rel), previous=restores.get(to);
      for (let current=to; current!==root; current=path.dirname(current)) {
        if (!inside(root,current)) throw Error('Legacy destination escapes root');
        if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw Error('Legacy destination is a link: '+current);
      }
      if((fs.existsSync(to)&&hash(to)!==hash(from)) || (previous&&hash(previous)!==hash(from))) throw Error(`Legacy source conflict: ${rel}`);
      restores.set(to,from);
    }
  }
  for(const [to,from] of restores) if(!fs.existsSync(to)){fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to,fs.constants.COPYFILE_EXCL);}
  for(const park of parks) fs.renameSync(path.join(root,park),path.join(base,'legacy-'+randomUUID()));
}
export function finishOutput(root, base) {
  const file=path.join(base,'output-transaction.json');if(!fs.existsSync(file)) return;
  const tx=JSON.parse(fs.readFileSync(file,'utf8')), out=path.join(root,'out');
  if(!inside(base,tx.stage)||!inside(base,tx.backup)||path.basename(tx.backup).slice(0,9)!=='previous-') throw Error('Invalid output transaction');
  for(const dir of [out,tx.stage,tx.backup]) if(fs.existsSync(dir)) noLinks(dir);
  if(fs.existsSync(tx.stage)) {
    if(!fs.existsSync(path.join(tx.stage,'index.html'))) throw Error('Incomplete generated output');
    if(fs.existsSync(out)) {if(fs.existsSync(tx.backup)) throw Error('Output changed during publication');fs.renameSync(out,tx.backup);}
    fs.renameSync(tx.stage,out);
  } else if(!fs.existsSync(out)) {
    if(fs.existsSync(tx.backup)) fs.renameSync(tx.backup,out);
    throw Error('Generated output missing; previous output restored');
  }
  if(fs.existsSync(tx.backup)) fs.rmSync(tx.backup,{recursive:true});
  fs.unlinkSync(file);
}
export async function buildFrontend(root, run = createRunner()) {
  root=fs.realpathSync.native(root);
  const base=path.join(root,'my/tauri-build');fs.mkdirSync(base,{recursive:true});
  if(fs.realpathSync.native(base)!==base) throw Error('Build workspace must not be a link');
  const lock=path.join(base,'lock.json');
  if(fs.existsSync(lock)){const owner=JSON.parse(fs.readFileSync(lock,'utf8'));if(alive(owner.pid))throw Error('Another frontend build is running');fs.renameSync(lock,path.join(base,'stale-lock-'+randomUUID()+'.json'));}
  fs.writeFileSync(lock,JSON.stringify({pid:process.pid}),{flag:'wx'});
  let stage;
  try {
    recoverLegacy(root,base);finishOutput(root,base);
    stage=fs.mkdtempSync(path.join(base,'stage-'));
    const directories=['app','components','lib','public','worker','types'];
    const configs=fs.readdirSync(root).filter(name=>/\.(?:[cm]?js|tsx?|json|css)$/.test(name)||/^\.env(?:\..+)?$/.test(name)||['.eslintignore'].includes(name));
    for(const name of [...directories,...configs]) {
      const source=path.join(root,name);if(!fs.existsSync(source))continue;
      noLinks(source);
      fs.cpSync(source,path.join(stage,name),{recursive:true,filter:from=>!(from.startsWith(path.join(root,'app/api')+path.sep)&&path.basename(from)==='route.ts')});
    }
    fs.symlinkSync(path.join(root,'node_modules'),path.join(stage,'node_modules'),process.platform==='win32'?'junction':'dir');
    await run(process.execPath,[path.join(stage,'node_modules/next/dist/bin/next'),'build'],{cwd:stage,env:{...process.env,IS_TAURI_BUILD:'true'},timeoutMs:25*60_000,onOutput:line=>process.stdout.write(line)});
    const generated=path.join(stage,'out');
    if(!fs.existsSync(path.join(generated,'index.html')))throw Error('Frontend output is incomplete');
    atomic(path.join(base,'output-transaction.json'),{stage:generated,backup:path.join(base,'previous-'+randomUUID())});
    finishOutput(root,base);
  } finally {
    // Preserve an unfinished publication for the next invocation.
    if(stage&&!fs.existsSync(path.join(base,'output-transaction.json'))) {
      const modules=path.join(stage,'node_modules');if(fs.existsSync(modules)){if(process.platform==='win32')fs.rmdirSync(modules);else fs.unlinkSync(modules);}
      fs.rmSync(stage,{recursive:true,force:true});
    }
    fs.unlinkSync(lock);
  }
}
