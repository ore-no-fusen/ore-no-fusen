import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {execFileSync,spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';
const REPO='ore-no-fusen/ore-no-fusen';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function protectedRunIds(runs, explicit=[]) {
 const sorted=[...runs.values()].filter(r=>r.status==='completed').sort((a,b)=>b.id-a.id);
 const keep=new Set(explicit);
 for(const r of sorted.filter(r=>r.conclusion==='success').slice(0,3))keep.add(r.id);
 for(const branch of ['main','develop'])for(const conclusion of ['success','failure']) {
  const r=sorted.find(r=>r.head_branch===branch&&r.conclusion===conclusion);if(r)keep.add(r.id);
 }
 return [...keep];
}

export function artifactCandidates(artifacts,runs,{now=Date.now(),protectedRuns=[],openPRs=[],minAgeMs=24*3600_000,protectLatest=true}={}) {
 const protectedSet=new Set(protectedRuns),open=new Set(openPRs);
 if(protectLatest)for(const id of protectedRunIds(runs))protectedSet.add(id);
 return artifacts.filter(a=>{const r=runs.get(a.workflow_run?.id);return /^msix-ci-(?:\d+-\d+-)?[a-f0-9]{40}$/.test(a.name)&&!a.expired&&r?.status==='completed'&&!protectedSet.has(r.id)&&!r.pull_requests?.some(p=>open.has(p.number))&&now-Date.parse(a.created_at)>=minAgeMs;});
}
async function main(args){
 const flag=name=>args.includes(name),value=name=>args[args.indexOf(name)+1];
 const directory=path.resolve(flag('--directory')?value('--directory'):'my/ci-artifact-archive');fs.mkdirSync(directory,{recursive:true});
 const token=process.env.GH_TOKEN??execFileSync('gh',['auth','token'],{encoding:'utf8',timeout:10_000,stdio:['ignore','pipe','pipe']}).trim();
 async function api(route,method='GET',allowMissing=false){const r=await fetch('https://api.github.com/repos/'+REPO+'/'+route,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30_000)});if(r.status===404&&allowMissing&&method==='GET')return null;if(!r.ok)throw Error('GitHub request failed: '+r.status);return method==='DELETE'?null:r.json();}
 async function pages(route,key){const all=[];for(let n=1;n<100;n++){const p=await api(route+(route.includes('?')?'&':'?')+'per_page=100&page='+n);const rows=p[key]??p;all.push(...rows);if(rows.length<100)return all;}throw Error('Pagination limit reached');}
 if(flag('--apply')) {
  const bytes=fs.readFileSync(path.join(directory,'manifest.json'));if(hash(bytes)!==value('--manifest-sha256'))throw Error('Manifest hash does not match reviewed plan');
  const manifest=JSON.parse(bytes);if(manifest.repo!==REPO)throw Error('Wrong repository');
  const journal=path.join(directory,'deleted.jsonl');
  const deleted=new Map(fs.existsSync(journal)?fs.readFileSync(journal,'utf8').trim().split('\n').filter(Boolean).map(line=>{const record=JSON.parse(line);return [record.id,record];}):[]);
  const open=await pages('pulls?state=open');
  const freshRuns=new Map((await pages('actions/runs?status=completed','workflow_runs')).map(run=>[run.id,run]));
  const protectedNow=protectedRunIds(freshRuns,manifest.protectedRuns);
  const counts={deleted:0,skipped:0,alreadyAbsent:0};
  for(const item of manifest.candidates){
   const archive=fs.readFileSync(path.join(directory,item.id+'.zip'));if(hash(archive)!==item.archiveSha256)throw Error('Preserved archive changed');
   const recorded=deleted.get(item.id);
   if(recorded) {if(recorded.sha256!==item.archiveSha256)throw Error('Deletion journal conflicts with preserved archive');counts.skipped++;continue;}
   const current=await api('actions/artifacts/'+item.id,'GET',true);
   if(!current){counts.alreadyAbsent++;fs.appendFileSync(journal,JSON.stringify({id:item.id,sha256:item.archiveSha256,alreadyAbsent:true,at:new Date().toISOString()})+'\n');continue;}
   const run=await api('actions/runs/'+current.workflow_run.id);
   if(!artifactCandidates([current],new Map([[run.id,run]]),{protectedRuns:protectedNow,openPRs:open.map(p=>p.number),minAgeMs:manifest.minAgeMs,protectLatest:false}).length||['id','name','size_in_bytes','created_at'].some(k=>current[k]!==item[k])||current.workflow_run.head_sha!==item.workflow_run.head_sha)throw Error('Artifact changed or became protected: '+item.id);
   await api('actions/artifacts/'+item.id,'DELETE');counts.deleted++;fs.appendFileSync(path.join(directory,'deleted.jsonl'),JSON.stringify({id:item.id,sha256:item.archiveSha256,at:new Date().toISOString()})+'\n');
  }
  console.log(JSON.stringify({reviewedCandidates:manifest.candidates.length,...counts}));return;
 }
 const artifacts=await pages('actions/artifacts','artifacts'),open=await pages('pulls?state=open');const runs=new Map();
 for(const id of new Set(artifacts.map(a=>a.workflow_run?.id).filter(Boolean)))runs.set(id,await api('actions/runs/'+id));
 const explicit=flag('--protect-runs')?value('--protect-runs').split(',').map(Number):[];
 if(explicit.some(id=>!Number.isSafeInteger(id)||id<=0))throw Error('Invalid protected run ID');
 const protectedRuns=protectedRunIds(runs,explicit);
 const minAgeMs=flag('--age-hours')?Number(value('--age-hours'))*3600_000:24*3600_000;
 if(!Number.isFinite(minAgeMs)||minAgeMs<3600_000)throw Error('Minimum artifact age must be at least one hour');
 const candidates=artifactCandidates(artifacts,runs,{protectedRuns,openPRs:open.map(p=>p.number),minAgeMs});
 async function archiveItem(item){
   const file=path.join(directory,item.id+'.zip');
   if(!fs.existsSync(file)) {
     const temp=file+'.partial', fd=fs.openSync(temp,'w');
     try { await new Promise((resolve,reject)=>{const child=spawn('gh',['api','repos/'+REPO+'/actions/artifacts/'+item.id+'/zip'],{stdio:['ignore',fd,'pipe'],timeout:600_000,env:{...process.env,GH_TOKEN:token},windowsHide:true});child.stderr.resume();child.on('error',reject);child.on('close',(code,signal)=>code===0?resolve():reject(Error('Archive download failed '+item.id+': '+(signal??code))));}); }
     finally {fs.closeSync(fd);}
     const bytes=fs.readFileSync(temp);if(!item.digest||item.digest!=='sha256:'+hash(bytes))throw Error('Archive digest mismatch: '+item.id);
     fs.renameSync(temp,file);console.log('Archived '+item.id+' ('+Math.round(item.size_in_bytes/1024/1024)+' MiB)');
   }
   item.archiveSha256=hash(fs.readFileSync(file));
   if(!item.digest || item.digest!=='sha256:'+item.archiveSha256)throw Error('Archive cannot be verified against GitHub digest: '+item.id);
 }
 if(flag('--archive')) {
  let next=0;await Promise.all(Array.from({length:4},async()=>{while(next<candidates.length)await archiveItem(candidates[next++]);}));
 }
 const manifest={repo:REPO,createdAt:new Date().toISOString(),protectedRuns,minAgeMs,totalBytes:artifacts.filter(a=>!a.expired).reduce((n,a)=>n+a.size_in_bytes,0),candidates};
 const file=path.join(directory,'manifest.json');fs.writeFileSync(file,JSON.stringify(manifest,null,2));console.log(JSON.stringify({artifacts:artifacts.length,MiB:Math.round(manifest.totalBytes/1024/1024),candidates:candidates.length,candidateMiB:Math.round(candidates.reduce((n,a)=>n+a.size_in_bytes,0)/1024/1024),manifestSha256:hash(fs.readFileSync(file))}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1});
