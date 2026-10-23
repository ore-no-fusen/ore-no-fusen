import { beforeEach, describe, expect, it } from 'vitest';
import { clearEditDraft, editBaseline, readEditDraft, writeEditDraft } from './edit-draft';
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
