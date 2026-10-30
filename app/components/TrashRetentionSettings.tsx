'use client';
import React, {useEffect,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import ConfirmDialog from './ConfirmDialog';
type Item={path:string;deletedAt:string|null;eligible:boolean;reason:string};
type Preview={token:string;items:Item[];eligibleCount:number;preservedCount:number;assetCount:number};
type Result={deletedNotes:number;deletedAssets:number;errors:string[]};
export default function TrashRetentionSettings({basePath,language}:{basePath?:string|null;language:'ja'|'en'}){
 const en=language==='en';const [active,setActive]=useState(false),[stopped,setStopped]=useState(false),[preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[confirm,setConfirm]=useState(false),[visibleCount,setVisibleCount]=useState(50);
 useEffect(()=>{let current=true;setActive(false);setStopped(false);setPreview(null);invoke<boolean>('fusen_trash_cleanup_status').then(async value=>{if(current)setActive(value);if(value){try{await invoke('fusen_trash_cleanup_health')}catch{if(current)setStopped(true)}}}).catch(()=>{if(current)setMessage(language==='en'?'Could not read cleanup settings.':'自動整理の設定を読み取れませんでした。')});return()=>{current=false}},[basePath,language]);
 const review=async()=>{setVisibleCount(50);setBusy(true);setPreview(null);setMessage('');try{setPreview(await invoke<Preview>('fusen_trash_cleanup_preview'));setStopped(false);}catch{setStopped(true);setMessage(en?'Cleanup is stopped because Trash could not be checked safely. No files were deleted. Preserve the history before checking it.':'ごみ箱を安全に確認できないため整理を停止しています。ファイルは削除していません。履歴を保全してから確認してください。');}finally{setBusy(false);}};
 const configure=async(value:boolean)=>{if(value&&!preview)return;setBusy(true);setMessage('');try{await invoke('fusen_set_trash_cleanup',{enabled:value,token:value?preview!.token:null});setActive(value);setMessage(en?(value?'Automatic cleanup enabled.':'Automatic cleanup disabled.'):(value?'自動整理を有効にしました。':'自動整理を停止しました。'));}catch{setMessage(en?'Settings were not changed. Review Trash again.':'設定を変更できませんでした。対象をもう一度確認してください。');setPreview(null);}finally{setBusy(false);}};
 const cleanup=async()=>{setConfirm(false);if(!preview)return;setBusy(true);setMessage('');try{const r=await invoke<Result>('fusen_trash_cleanup_run',{token:preview.token});setMessage(en?`Deleted ${r.deletedNotes} notes and ${r.deletedAssets} images.${r.errors.length?' Cleanup stopped before completing; review again.':''}`:`付箋${r.deletedNotes}件、画像${r.deletedAssets}件を削除しました。${r.errors.length?'途中で停止しました。対象を再確認してください。':''}`);setPreview(null);}catch{setMessage(en?'Cleanup stopped. Review Trash again.':'整理を停止しました。対象をもう一度確認してください。');setPreview(null);}finally{setBusy(false);}};
 const reason=(value:string)=>({expired:en?'90 days elapsed':'90日経過',within_90_days:en?'Kept within 90 days':'90日以内のため保持',unknown_date:en?'Deletion date unknown; kept':'移動日不明のため保持',recount_90_days:en?'Date unknown: kept for 90 days from first check':'移動日不明：初回確認から90日間保持',changed_or_unknown:en?'Changed or unverified; kept':'変更あり・確認不能のため保持',batch_wait:en?'Kept for the next batch':'次回の整理まで保持'}[value]??(en?'Kept':'保持'));
 return <section className="order-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-label={en?'Trash retention':'ごみ箱の保存期間'}>
  <h3 className="font-bold text-slate-800">{en?'5 Trash retention (90 days)':'5 ごみ箱の保存期間（90日）'}</h3>
  <p className="mt-2 text-sm text-slate-600">{en?'Automatic cleanup is off by default. When enabled, it checks one hour after startup and at most once per day, then permanently deletes verified notes retained for at least 90 days. This cannot be undone.':'初期設定はオフです。有効にすると起動1時間後から1日1回以下で確認し、90日経過した確認可能な付箋を完全削除します。削除後は元に戻せません。'}</p>
  <p className="mt-2 text-xs text-slate-500">{en?'When the move date is unknown or a note changes, 90 days are counted from the first safe check. All images are kept. Changing the data location turns automatic cleanup off.':'移動日が不明な付箋や変更された付箋は、安全に確認した日から90日間保持します。画像はすべて保持します。保存先を変えると自動整理はオフになります。'}</p>
  <p className="mt-3 text-sm font-semibold">{en?'Automatic cleanup: ':'自動整理：'}{active?(stopped?(en?'On, but stopped for safety':'オン・安全停止中'):(en?'On (stops if safety checks fail)':'オン（安全確認に失敗すると停止）')):(en?'Off':'オフ')}</p>
  <div className="mt-3 flex flex-wrap gap-3">
   <button className="rounded border px-3 py-2 text-sm" disabled={busy} onClick={review}>{en?'Review Trash':'対象を確認する'}</button>
   {active?<button className="rounded border px-3 py-2 text-sm" disabled={busy} onClick={()=>configure(false)}>{en?'Turn off':'自動整理を停止する'}</button>:<button className="rounded border px-3 py-2 text-sm" disabled={busy||!preview} onClick={()=>configure(true)}>{en?'Enable 90-day automatic cleanup':'90日後の自動整理を有効にする'}</button>}
  </div>
  {preview&&<div className="mt-4 text-sm"><p>{en?`${preview.eligibleCount} eligible notes, ${preview.assetCount} unused images; ${preview.preservedCount} notes kept.`:`削除対象：付箋${preview.eligibleCount}件・未使用画像${preview.assetCount}件／保持：付箋${preview.preservedCount}件`}</p>
   <ul className="mt-2 max-h-48 overflow-y-auto text-xs">{preview.items.slice(0,visibleCount).map(item=><li className="mb-1 break-all" key={item.path}>{item.path} — {reason(item.reason)}</li>)}</ul>
   {preview.items.length>visibleCount&&<button className="mt-2 rounded border px-3 py-2" onClick={()=>setVisibleCount(count=>count+50)}>{en?'Show 50 more notes':'さらに50件を表示する'}</button>}
   <button className="mt-3 rounded border border-red-400 px-3 py-2 text-red-700" disabled={busy||!preview.eligibleCount} onClick={()=>setConfirm(true)}>{en?'Delete the reviewed expired items':'確認した90日経過分を削除する'}</button>
  </div>}
  {busy&&<p role="status" className="mt-2 text-sm">{en?'Checking…':'処理中…'}</p>}
  {message&&<p role="status" className="mt-3 text-sm">{message}</p>}
  <ConfirmDialog language={language} isOpen={confirm} title={en?'Permanently delete expired Trash items?':'90日経過したごみ箱の対象を完全に削除しますか？'} message={en?'The reviewed notes will be permanently deleted. They cannot be restored.':'確認した付箋を完全に削除します。削除後は復元できません。'} confirmText={en?'Delete permanently':'完全に削除する'} cancelText={en?'Cancel':'キャンセル'} onConfirm={cleanup} onCancel={()=>setConfirm(false)}/>
 </section>;
}
