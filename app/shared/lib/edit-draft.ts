import type { SharedNote } from './drive';

export type EditDraft={version:1;account:string;note:string;session:string;baseline:string;title:string;markdown:string;revision:string};
const SESSION='onf-shared-edit-session';
export function editBaseline(note:SharedNote):string {return JSON.stringify([note.operation.operationId,note.operation.payloadHash]);}
function session():string {
  let id=sessionStorage.getItem(SESSION);
  if(!id) {id=crypto.randomUUID();sessionStorage.setItem(SESSION,id);}
  return id;
}
function key(account:string,note:string,editor:string):string {return `onf-shared-edit:${JSON.stringify([account,note,editor])}`;}
export function readEditDraft(note:SharedNote):EditDraft|null {
  const editor=session();const raw=localStorage.getItem(key(note.scope.accountSubject,note.scope.noteId,editor));
  if(!raw) return null;
  const value=JSON.parse(raw) as EditDraft;
  if(value.version!==1 || value.account!==note.scope.accountSubject || value.note!==note.scope.noteId || value.session!==editor || typeof value.baseline!=='string' || typeof value.title!=='string' || typeof value.markdown!=='string' || typeof value.revision!=='string') throw new Error('保存した下書きを確認できません。下書きは削除していません。');
  return value;
}
export function writeEditDraft(note:SharedNote,title:string,markdown:string,baseline:string):EditDraft {
  const editor=session();
  const value:EditDraft={version:1,account:note.scope.accountSubject,note:note.scope.noteId,session:editor,baseline,title,markdown,revision:crypto.randomUUID()};
  localStorage.setItem(key(value.account,value.note,editor),JSON.stringify(value));return value;
}
/** Remove only the exact revision confirmed saved or explicitly discarded. */
export function clearEditDraft(value:EditDraft):void {
  const target=key(value.account,value.note,value.session);
  if(localStorage.getItem(target)===JSON.stringify(value)) localStorage.removeItem(target);
}
