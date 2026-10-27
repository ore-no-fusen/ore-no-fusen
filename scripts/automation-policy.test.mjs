import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {load:parse}=require('js-yaml');

test('receipt publication and validation preserve all required checks and read-only permissions',()=>{
 const workflow=parse(fs.readFileSync('.github/workflows/test.yml','utf8'));
 const msix=parse(fs.readFileSync('.github/workflows/msix-ci.yml','utf8'));
 assert.equal(workflow.permissions.actions,'read');assert.equal(workflow.jobs.msix.permissions.actions,'read');
 assert.equal(msix.permissions.actions,'read');assert.equal(msix.permissions.contents,'read');
 for(const [name,job] of [['frontend',workflow.jobs.frontend],['rust',workflow.jobs.rust],['msix',msix.jobs['build-install-smoke']]]){
  const check=job.steps.find(s=>s.id==='validation');assert.equal(check.run,`node scripts/ci-validation-reuse.mjs check ${name}`);
  const receipt=job.steps.find(s=>s.name==='Save validation receipt');
  assert.equal(receipt.with.path,`.ci-validation/${name}.json`);assert.equal(receipt.with['include-hidden-files'],true);
  assert.equal(receipt.with['retention-days'],1);assert.equal(receipt.with['if-no-files-found'],'error');
  assert.ok(job.steps.find(s=>s.id==='receipt').if.includes('success()'));
  assert.ok(job.outputs.reused);assert.ok(job.outputs.source_run);
 }
 assert.equal(workflow.jobs.gate.steps.at(-1).run,'node scripts/ci-validation-reuse.mjs audit');
});

test('Tauri frontend is built once per code pipeline and failures still gate merging',()=>{
 const workflow=parse(fs.readFileSync('.github/workflows/test.yml','utf8'));
 const msix=parse(fs.readFileSync('.github/workflows/msix-ci.yml','utf8'));
 const config=JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json','utf8'));
 const builds=workflow.jobs.frontend.steps.filter(step=>step.run==='npm run build:tauri');
 assert.equal(builds.length,1);
 // Missing/unknown outputs retain the standalone check; gate rejects bad scope.
 assert.equal(builds[0].if,"steps.validation.outputs.reused != 'true' && (needs.scope.outputs.msix != 'true')");
 assert.equal(builds[0]['continue-on-error'],undefined);
 assert.equal(workflow.jobs.msix.if,"needs.scope.outputs.msix == 'true'");
 assert.deepEqual(workflow.jobs.msix.needs,['scope','frontend','rust','usage-analysis']);
 assert.equal(workflow.jobs.msix.uses,'./.github/workflows/msix-ci.yml');
 assert.equal(config.build.beforeBuildCommand,'npm run build:tauri');
 const tauri=msix.jobs['build-install-smoke'].steps.find(step=>step.id==='tauri_build');
 assert.equal(tauri.run,'npx tauri build --no-bundle --ci');
 assert.equal(tauri.if,"steps.validation.outputs.reused != 'true'");
 assert.equal(tauri['continue-on-error'],undefined);
 assert.ok(workflow.jobs.gate.needs.includes('frontend'));
 assert.ok(workflow.jobs.gate.needs.includes('msix'));
 assert.equal(workflow.jobs.gate.if,'always()');
});
test('retired release entries cannot mutate a protected branch',()=>{for(const name of ['do-release.yml','do-non-app-release.yml']){const text=fs.readFileSync('.github/workflows/'+name,'utf8');assert.ok(text.includes('exit 1'));assert.doesNotMatch(text,/git push|contents: write/);}});
test('E2E hooks never stop the regular development port',()=>assert.doesNotMatch(fs.readFileSync('.husky/pre-commit','utf8'),/Stop-Process|3002/));
test('required validation and short diagnostic retention remain explicit',()=>{const text=fs.readFileSync('.github/workflows/test.yml','utf8');assert.deepEqual(parse(text).jobs.msix.needs,['scope','frontend','rust','usage-analysis']);assert.match(text,/cargo test --locked\s/);const msix=fs.readFileSync('.github/workflows/msix-ci.yml','utf8');assert.match(msix,/npm run build\s/);assert.match(msix,/retention-days: 1/);assert.doesNotMatch(msix,/createOrUpdateFileContents|contents: write/);});

test('development REST deployment retains v1 and cannot inherit Gateway registration',()=>{
 const text=fs.readFileSync('workers/discord-replies/wrangler.toml','utf8');
 const section=text.split('[env.development]')[1];assert.ok(section);
 assert.match(section,/\[\[env\.development\.migrations\]\]\s*tag = "v1"\s*new_sqlite_classes = \["DiscordIngestCoordinator"\]/);
 assert.doesNotMatch(section,/class_name = "DiscordGateway"|new_sqlite_classes = \["DiscordGateway"\]/);
});

test('documentation uses its own guarded gate and one design build per Test run',()=>{
 const workflow=fs.readFileSync('.github/workflows/test.yml','utf8');
 assert.deepEqual(parse(workflow).jobs.gate.needs,['scope','usage-analysis','frontend','rust','msix','documentation','design-docs']);
 assert.equal((workflow.match(/if: needs\.scope\.outputs\.docs_only == 'false'/g)||[]).length,3);
 assert.match(workflow,/if: needs\.scope\.outputs\.docs_only == 'true'/);
 assert.match(workflow,/node scripts\/ci-scope\.mjs documents/);
 assert.match(workflow,/uses: \.\/\.github\/workflows\/docs\.yml/);
 const docs=fs.readFileSync('.github/workflows/docs.yml','utf8');
 assert.match(docs,/workflow_call:/);assert.doesNotMatch(docs,/^  push:/m);
 assert.match(docs,/github\.ref == 'refs\/heads\/main' &&/);
});
