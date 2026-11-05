import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
export function msixStatus({ jobStatus, prevalidated, steps, exists }) {
  const required=['certificate','npm_ci','next_build','tauri_build','msix_create','msix_verify','msix_smoke',...(!prevalidated?['frontend_tests','rust_tests']:[])];
  const outcomes=Object.fromEntries(required.map(name=>[name,steps[name]?.outcome??'missing']));
  return {overall:jobStatus==='success'&&exists&&Object.values(outcomes).every(value=>value==='success')?'success':jobStatus==='cancelled'?'cancelled':'failure',steps:outcomes,created:exists};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 const status=msixStatus({jobStatus:process.env.JOB_STATUS,prevalidated:process.env.PREVALIDATED==='true',steps:JSON.parse(process.env.STEP_RESULTS??'{}'),exists:fs.existsSync('packaging/msix/dev/out/ore-no-fusen-dev.msix')});
 fs.writeFileSync('msix-ci-status.json',JSON.stringify({...status,run_id:process.env.GITHUB_RUN_ID,run_attempt:process.env.GITHUB_RUN_ATTEMPT,commit_sha:process.env.GITHUB_SHA,updated_at:new Date().toISOString()},null,2));
 console.log(JSON.stringify(status));
}
