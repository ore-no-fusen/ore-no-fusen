import { beforeEach, describe, expect, it } from 'vitest';
import { clearEditDraft, editBaseline, listOtherEditDrafts, recoverEditDraft, readEditDraft, writeEditDraft } from './edit-draft';
import type { SharedNote } from './drive';
const note={scope:{accountSubject:'account',noteId:'note'},operation:{operationId:'op',payloadHash:'hash'}} as SharedNote;
beforeEach(()=>{localStorage.clear();sessionStorage.clear();});
describe('existing edit draft retention',()=>{
  it('restores unsent edits and their exact baseline after reload',()=>{
    writeEditDraft(note,'題名','未送信の本文',editBaseline(note));
    expect(readEditDraft(note)?.markdown).toBe('未送信の本文');expect(readEditDraft(note)?.baseline).toBe(editBaseline(note));
  });
  it('does not erase a newer edit when an earlier save completes',()=>{
    const sent=writeEditDraft(note,'題名','送信した内容',editBaseline(note));
    writeEditDraft(note,'題名','送信後の追記',editBaseline(note));clearEditDraft(sent);
    expect(readEditDraft(note)?.markdown).toBe('送信後の追記');
  });
  it('separates accounts, notes and editor sessions and clears only the confirmed draft',()=>{
    const first=writeEditDraft(note,'題名','1',editBaseline(note));sessionStorage.clear();
    const second=writeEditDraft(note,'題名','2',editBaseline(note));clearEditDraft(first);
    expect(readEditDraft(note)?.markdown).toBe('2');
    expect(readEditDraft({...note,scope:{...note.scope,noteId:'other'}})).toBeNull();
    expect(readEditDraft({...note,scope:{...note.scope,accountSubject:'other'}})).toBeNull();
    clearEditDraft(second);expect(readEditDraft(note)).toBeNull();
  });
});

describe('closed tab draft recovery',()=>{
  it('lists and explicitly restores a previous session without leaving a redundant copy',()=>{
    const old=writeEditDraft(note,'題名','閉じたタブの本文',editBaseline(note));sessionStorage.clear();
    expect(readEditDraft(note)).toBeNull();expect(listOtherEditDrafts(note)).toEqual([old]);
    recoverEditDraft(note,old);expect(readEditDraft(note)?.markdown).toBe(old.markdown);expect(listOtherEditDrafts(note)).toEqual([]);
  });
  it('never exposes another account or note and rejects a changed source',()=>{
    const old=writeEditDraft(note,'題名','旧本文',editBaseline(note));
    writeEditDraft(note,'題名','新本文',editBaseline(note));sessionStorage.clear();
    expect(listOtherEditDrafts({...note,scope:{...note.scope,accountSubject:'other'}})).toEqual([]);
    expect(listOtherEditDrafts({...note,scope:{...note.scope,noteId:'other'}})).toEqual([]);
    expect(()=>recoverEditDraft(note,old)).toThrow('更新');expect(listOtherEditDrafts(note)[0].markdown).toBe('新本文');
  });
  it('keeps the original draft if recovery storage fails',()=>{
    const old=writeEditDraft(note,'題名','保持する本文',editBaseline(note));sessionStorage.clear();
    const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('onf-shared-edit:'))throw new Error('quota');return set.call(this,k,v);};
    try {expect(()=>recoverEditDraft(note,old)).toThrow('quota');}finally{Storage.prototype.setItem=set;}
    expect(listOtherEditDrafts(note)).toEqual([old]);
  });
});

it('deleting an old immutable revision cannot delete a concurrent new revision',()=>{
 const first=writeEditDraft(note,'題名','旧版',editBaseline(note));
 const originalRemove=Storage.prototype.removeItem;let concurrent=false;
 Storage.prototype.removeItem=function(k){if(!concurrent){concurrent=true;writeEditDraft(note,'題名','同時更新の新版',editBaseline(note));}return originalRemove.call(this,k);};
 try{clearEditDraft(first);}finally{Storage.prototype.removeItem=originalRemove;}
 expect(readEditDraft(note)?.markdown).toBe('同時更新の新版');
});
