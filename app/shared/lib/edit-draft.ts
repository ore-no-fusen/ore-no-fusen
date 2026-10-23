import type { SharedNote } from './drive';
export type EditDraft={version:1;account:string;note:string;session:string;baseline:string;title:string;markdown:string;revision:string};
const SESSION='onf-shared-edit-session';
const PREFIX='onf-shared-edit:';
const owned=new Map<string,EditDraft>();
export function editBaseline(note:SharedNote):string {return JSON.stringify([note.operation.operationId,note.operation.payloadHash]);}
function session():string {let id=sessionStorage.getItem(SESSION);if(!id){id=crypto.randomUUID();sessionStorage.setItem(SESSION,id);}return id;}
function scope(account:string,note:string,editor:string):string{return PREFIX+JSON.stringify([account,note,editor]);}
function key(value:EditDraft):string{return scope(value.account,value.note,value.session)+':'+value.revision;}
function valid(value:EditDraft|null,note:SharedNote):value is EditDraft{return value?.version===1 && value.account===note.scope.accountSubject && value.note===note.scope.noteId && typeof value.session==='string' && typeof value.baseline==='string' && typeof value.title==='string' && typeof value.markdown==='string' && typeof value.revision==='string';}
function all(note:SharedNote):EditDraft[]{const values:EditDraft[]=[];for(let i=0;i<localStorage.length;i++){const target=localStorage.key(i);if(!target?.startsWith(PREFIX))continue;try{const value=JSON.parse(localStorage.getItem(target)??'null') as EditDraft|null;if(valid(value,note)&&target===key(value))values.push(value);}catch{/* Never delete unreadable data. */}}return values;}
export function readEditDraft(note:SharedNote):EditDraft|null {
 const head=sessionStorage.getItem(scope(note.scope.accountSubject,note.scope.noteId,session()));if(!head)return null;
 const raw=localStorage.getItem(head);if(!raw)return null;const value=JSON.parse(raw) as EditDraft;
 if(!valid(value,note)||key(value)!==head)throw new Error('保存した下書きを確認できません。下書きは削除していません。');return value;
}
export function writeEditDraft(note:SharedNote,title:string,markdown:string,baseline:string):EditDraft {
 const editor=session(),owner=scope(note.scope.accountSubject,note.scope.noteId,editor);
 const value:EditDraft={version:1,account:note.scope.accountSubject,note:note.scope.noteId,session:editor,baseline,title,markdown,revision:crypto.randomUUID()};
 const previous=owned.get(owner) ?? readEditDraft(note);
 localStorage.setItem(key(value),JSON.stringify(value));
 sessionStorage.setItem(owner,key(value));
 owned.set(owner,value);if(previous)clearEditDraft(previous);return value;
}
/** Each revision has its own immutable physical key; a different revision is never removed. */
export function clearEditDraft(value:EditDraft):void {localStorage.removeItem(key(value));}
export function listOtherEditDrafts(note:SharedNote):EditDraft[]{const current=readEditDraft(note);return all(note).filter(value=>value.revision!==current?.revision);}
export function recoverEditDraft(note:SharedNote,value:EditDraft):EditDraft {
 if(!valid(value,note)||localStorage.getItem(key(value))!==JSON.stringify(value))throw new Error('下書きが更新されています。一覧を開き直してください。');
 const recovered=writeEditDraft(note,value.title,value.markdown,value.baseline);clearEditDraft(value);return recovered;
}
