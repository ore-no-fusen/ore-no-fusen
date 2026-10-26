import test from 'node:test';import assert from 'node:assert/strict';import {artifactCandidates} from './ci-artifact-policy.mjs';
const a={id:1,name:'msix-ci-'+'a'.repeat(40),created_at:'2020-01-01T00:00:00Z',expired:false,workflow_run:{id:1}};
const run={id:1,status:'completed',conclusion:'failure',pull_requests:[]};
test('only completed disposable CI artifacts are eligible',()=>{assert.equal(artifactCandidates([a],new Map([[1,run]])).length,1);for(const item of [{...a,name:'store-msix'},{...a,name:'github-pages'},{...a,expired:true}])assert.equal(artifactCandidates([item],new Map([[1,run]])).length,0);assert.equal(artifactCandidates([a],new Map([[1,{...run,status:'in_progress'}]])).length,0);});
test('open PRs, explicitly protected runs and recent outputs are retained',()=>{assert.equal(artifactCandidates([a],new Map([[1,run]]),{protectedRuns:[1]}).length,0);assert.equal(artifactCandidates([a],new Map([[1,{...run,pull_requests:[{number:42}]}]]),{openPRs:[42]}).length,0);assert.equal(artifactCandidates([{...a,created_at:new Date().toISOString()}],new Map([[1,run]])).length,0);});
test('latest successful evidence is retained',()=>assert.equal(artifactCandidates([a],new Map([[1,{...run,conclusion:'success'}]])).length,0));

test('main/develop latest success and failure evidence survive newer feature runs',()=>{
 const runs=new Map(Array.from({length:6},(_,i)=>[i+1,{...run,id:i+1,head_branch:i<2?'main':i<4?'develop':'feature',conclusion:i%2?'success':'failure'}]));
 for(const id of [1,2,3,4,6])assert.equal(artifactCandidates([{...a,workflow_run:{id}}],runs).length,0);
});
