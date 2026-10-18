import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveChecks, nextClock } from './operations.mjs';
const snapshot = { generation: 'g1', items: ['milk', 'eggs', 'bread', 'rice'], initial: {} };
const op = (actor, itemId, checked, clock=1, generation='g1') => ({ id: actor+'-'+clock+'-'+itemId, actor, itemId, checked, clock, generation });
test('different items survive concurrent updates and duplicate retries', () => {
  const a=op('A','milk',true), b=op('B','eggs',true);
  assert.deepEqual(resolveChecks(snapshot,[a,b,a]), {milk:true,eggs:true,bread:false,rice:false});
});
test('opposite concurrent checks converge regardless of delivery order', () => {
  const a=op('A','milk',true), b=op('B','milk',false);
  assert.deepEqual(resolveChecks(snapshot,[a,b]),resolveChecks(snapshot,[b,a,b]));
});
test('observed newer change wins even if older operation arrives later', () => {
  const old=op('Z','milk',true,5), newer=op('A','milk',false,nextClock(1,[old]));
  assert.equal(resolveChecks(snapshot,[newer,old]).milk,false);
});
test('new sharing generation rejects offline operations from previous sharing', () => {
  assert.equal(resolveChecks({...snapshot,generation:'g2'},[op('A','milk',true)]).milk,false);
});
test('deleted items cannot reappear from delayed operations', () => {
  assert.deepEqual(resolveChecks({...snapshot,items:['eggs']},[op('A','milk',true)]),{eggs:false});
});
test('reused operation ID with different content is rejected', () => {
  const a=op('A','milk',true);assert.throws(()=>resolveChecks(snapshot,[a,{...a,checked:false}]),/Conflicting/);
});
test('all permutations of three concurrent devices converge', () => {
  const ops=[op('A','milk',true),op('B','eggs',true),op('C','milk',false)];
  for(const i of [0,1,2])for(const j of [0,1,2])if(i!==j){const k=3-i-j;
    assert.deepEqual(resolveChecks(snapshot,[ops[i],ops[j],ops[k]]),resolveChecks(snapshot,ops));}
});
test('clock cannot silently overflow',()=>assert.throws(()=>nextClock(Number.MAX_SAFE_INTEGER,[]),/exhausted/));
