import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
test('retired release entries cannot mutate a protected branch',()=>{for(const name of ['do-release.yml','do-non-app-release.yml']){const text=fs.readFileSync('.github/workflows/'+name,'utf8');assert.ok(text.includes('exit 1'));assert.doesNotMatch(text,/git push|contents: write/);}});
test('E2E hooks never stop the regular development port',()=>assert.doesNotMatch(fs.readFileSync('.husky/pre-commit','utf8'),/Stop-Process|3002/));
test('required validation and short diagnostic retention remain explicit',()=>{const text=fs.readFileSync('.github/workflows/test.yml','utf8');assert.match(text,/needs: \[scope, frontend, rust, usage-analysis\]/);assert.match(text,/cargo test --locked\s/);const msix=fs.readFileSync('.github/workflows/msix-ci.yml','utf8');assert.match(msix,/npm run build\s/);assert.match(msix,/retention-days: 1/);assert.doesNotMatch(msix,/createOrUpdateFileContents|contents: write/);});

test('development REST deployment retains v1 and cannot inherit Gateway registration',()=>{
 const text=fs.readFileSync('workers/discord-replies/wrangler.toml','utf8');
 const section=text.split('[env.development]')[1];assert.ok(section);
 assert.match(section,/\[\[env\.development\.migrations\]\]\s*tag = "v1"\s*new_sqlite_classes = \["DiscordIngestCoordinator"\]/);
 assert.doesNotMatch(section,/class_name = "DiscordGateway"|new_sqlite_classes = \["DiscordGateway"\]/);
});

test('documentation uses its own guarded gate and one design build per Test run',()=>{
 const workflow=fs.readFileSync('.github/workflows/test.yml','utf8');
 assert.match(workflow,/needs: \[scope, usage-analysis, frontend, rust, msix, documentation, design-docs\]/);
 assert.equal((workflow.match(/if: needs\.scope\.outputs\.docs_only == 'false'/g)||[]).length,3);
 assert.match(workflow,/if: needs\.scope\.outputs\.docs_only == 'true'/);
 assert.match(workflow,/node scripts\/ci-scope\.mjs documents/);
 assert.match(workflow,/uses: \.\/\.github\/workflows\/docs\.yml/);
 const docs=fs.readFileSync('.github/workflows/docs.yml','utf8');
 assert.match(docs,/workflow_call:/);assert.doesNotMatch(docs,/^  push:/m);
 assert.match(docs,/github\.ref == 'refs\/heads\/main' &&/);
});
