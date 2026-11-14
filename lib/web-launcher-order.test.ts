import { describe, expect, it } from 'vitest';
import { applyLauncherOrder, parseLauncherOrder, type LauncherOrder } from './web-launcher-order';
const pc='11111111-1111-4111-8111-111111111111';
const order:LauncherOrder={schemaVersion:1,accountSubject:'account',pcId:pc,name:'PC',entries:[{noteId:'z',generation:1},{noteId:'a',generation:1}]};
const note=(noteId:string,generation=1,accountSubject='account')=>({scope:{noteId,generation,accountSubject}});
describe('PC launcher order',()=>{
  it('uses the PC sequence without mutating content or the source array',()=>{
    const notes=[note('a'),note('z'),note('new')];
    expect(applyLauncherOrder(notes,order).map(n=>n.scope.noteId)).toEqual(['z','a','new']);
    expect(notes.map(n=>n.scope.noteId)).toEqual(['a','z','new']);
    expect(applyLauncherOrder(notes)).toEqual(notes);
  });
  it('never resurrects absent rows or ranks a different generation/account; pending rows follow',()=>{
    const notes=[note('a',2),note('z'),note('a',1,'other'),note('pending',0)];
    expect(applyLauncherOrder(notes,order)).toEqual([notes[1],notes[0],notes[2],notes[3]]);
    expect(applyLauncherOrder([],order)).toEqual([]);
  });
  it('validates account, filename, generation, duplicate IDs and private paths',()=>{
    expect(parseLauncherOrder(order,`web-order-${pc}.json`,'account')).toEqual(order);
    for(const changed of [{...order,accountSubject:'other'},{...order,schemaVersion:2},{...order,entries:[...order.entries,order.entries[0]]},
      {...order,entries:[{noteId:'C:\\private\\note.md',generation:1}]},{...order,entries:[{noteId:'a',generation:0}]}]){
      expect(()=>parseLauncherOrder(changed,`web-order-${pc}.json`,'account')).toThrow();
    }
    expect(()=>parseLauncherOrder(order,'web-order-other.json','account')).toThrow();
  });
});
