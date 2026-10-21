'use client';
import React,{useEffect,useState} from 'react';
import {submitWebCreate,webReceivers,type WebCreateRequest,type WebReceiver} from './lib/drive';

export function NewNote({token,onDone}:{token:string;onDone:(message:string)=>void}) {
  const button:React.CSSProperties={border:'1px solid #cbd5e1',borderRadius:8,padding:'9px 14px',background:'white',color:'#162238',fontWeight:600,cursor:'pointer'};
  // Each opened editor owns its durable draft. Other tabs cannot overwrite or
  // delete it. The tab-local snapshot also survives a reload.
  const [draftId,setDraftId]=useState(()=>crypto.randomUUID());
  const [requestId,setRequestId]=useState(draftId);
  const [savedDrafts,setSavedDrafts]=useState<{key:string;value:string}[]>([]);
  const [account,setAccount]=useState('');
  const [pcs,setPcs]=useState<WebReceiver[]>([]);
  const [target,setTarget]=useState('');
  const [body,setBody]=useState('');
  const [pending,setPending]=useState<WebCreateRequest|null>(null);
  const [busy,setBusy]=useState(false);
  const [receiverCheck,setReceiverCheck]=useState(0);
  const [message,setMessage]=useState('受取PCを確認しています…');
  useEffect(()=>{let cancelled=false; setMessage('受取PCを確認しています…'); void webReceivers(token).then(({account,pcs})=>{
    if(cancelled)return;
    setAccount(account);setPcs(pcs);setTarget(previous=>receiverCheck===0?(pcs[0]?.pcId??''):(pcs.some(pc=>pc.pcId===previous)?previous:''));
    try {const raw=sessionStorage.getItem(`shared-create:${account}`);if(raw){const draft=JSON.parse(raw);setBody(draft.body??'');if(draft.requestId)setRequestId(draft.requestId);if(draft.pending)setPending(draft.pending);if(draft.target)setTarget(pcs.some(p=>p.pcId===draft.target)?draft.target:'');}}catch {setMessage('下書きを読み込めませんでした。');return;}
    const saved=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(`shared-create:${account}:`)){const value=localStorage.getItem(key);if(value)saved.push({key,value});}}setSavedDrafts(saved);
    setMessage(pcs.length?'':'受取PCがありません。対応するWindows版で「Webと同期」を1回実行してください。');
  }).catch(e=>!cancelled&&setMessage(String(e)));return()=>{cancelled=true;};},[token,receiverCheck]);
  function persist(nextBody:string,nextTarget:string,nextPending:WebCreateRequest|null){
    try {const value=JSON.stringify({body:nextBody,target:nextTarget,pending:nextPending,requestId});localStorage.setItem(`shared-create:${account}:${draftId}`,value);sessionStorage.setItem(`shared-create:${account}`,value);return true;}
    catch {setMessage('下書きを端末に保存できません。この画面を閉じず本文をコピーしてください。');return false;}
  }
  async function save(){
    if(busy||!account||!target||!body.trim())return;
    if(new TextEncoder().encode(body).length>100_000 || /!\[|ore-fusen-image:/.test(body)){setMessage('文字・Markdownのみ、100KB以内で入力してください。画像参照には対応していません。');return;}
    const request=pending??{schemaVersion:1 as const,accountSubject:account,targetPcId:target,noteId:requestId,markdown:body};
    if(!persist(body,target,request))return;
    setPending(request);setBusy(true);
    try {await submitWebCreate(token,request);localStorage.removeItem(`shared-create:${account}:${draftId}`);const tabDraft=sessionStorage.getItem(`shared-create:${account}`);if(tabDraft&&JSON.parse(tabDraft).pending?.noteId===request.noteId)sessionStorage.removeItem(`shared-create:${account}`);onDone('保存しました。受取PCの「Webと同期」で新しい付箋を取り込んでください。');}
    catch(e){setMessage(`${e instanceof Error?e.message:String(e)} 入力は保持しています。同じ内容で再試行できます。`);}
    finally{setBusy(false);}
  }
  return <section aria-label="新規付箋" style={{background:'#f7e9b0',padding:20,borderRadius:12,margin:'16px 0'}}>
    <h2>新規付箋</h2>
    {savedDrafts.length>0&&<label>保存済み下書きから復元 <select aria-label="保存済み下書きから復元" value="" disabled={busy||!!pending} onChange={e=>{
      const saved=savedDrafts.find(d=>d.key===e.target.value);if(!saved)return;
      try{const d=JSON.parse(saved.value);if(body.trim()&&!window.confirm('現在の入力は端末に保持し、選択した下書きを開きますか？'))return;setDraftId(crypto.randomUUID());setBody(d.body??'');setTarget(pcs.some(pc=>pc.pcId===d.target)?d.target:'');setPending(d.pending??null);setRequestId(d.requestId??saved.key.split(':').pop()!);setMessage('下書きを復元しました。');}catch{setMessage('下書きを復元できません。');}
    }}><option value="">下書きを選択</option>{savedDrafts.map(d=><option key={d.key} value={d.key}>{(()=>{try{return JSON.parse(d.value).body.slice(0,30)||'空の下書き';}catch{return '読取不可';}})()}</option>)}</select></label>}
    <label>受取PC <select aria-label="受取PC" value={target} disabled={busy||!!pending} onChange={e=>{setTarget(e.target.value);persist(body,e.target.value,pending);}}><option value="">受取PCを選択</option>{pcs.map(pc=><option key={pc.pcId} value={pc.pcId}>{pc.name}</option>)}</select></label>
    <textarea aria-label="新規付箋の本文" rows={10} value={body} disabled={busy||!!pending||!account} placeholder="ここに付箋を書いてください" onChange={e=>{setBody(e.target.value);persist(e.target.value,target,null);}} style={{display:'block',width:'100%',boxSizing:'border-box',background:'transparent',font:'inherit',margin:'12px 0'}}/>
    <p role="status">{message}</p>
    <button style={button} disabled={busy||!!pending} onClick={()=>setReceiverCheck(value=>value+1)}>受取PCを再確認</button>{' '}
    <button style={{...button,background:'#1689dc',color:'white'}} onClick={()=>void save()} disabled={busy||!target||!body.trim()}>{busy?'保存中…':pending?'同じ内容で再試行':'保存'}</button>{' '}
    <button style={button} disabled={busy} onClick={()=>onDone('下書きはこの端末に保持しています。')}>閉じる</button>
    <p>文字・Markdownのみ。黄色の付箋として保存します。画像添付・色・タグの指定は後続対応です。</p>
  </section>;
}
