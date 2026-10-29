import React from 'react';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
const ipc=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke:ipc.invoke}));
import TrashRetentionSettings from './TrashRetentionSettings';
const preview={token:'reviewed',eligibleCount:1,preservedCount:1,assetCount:0,items:[{path:'Trash/old.md',deletedAt:'2026-01-01',eligible:true,reason:'expired'},{path:'Trash/legacy.md',deletedAt:null,eligible:false,reason:'unknown_date'}]};
beforeEach(()=>{ipc.invoke.mockReset();ipc.invoke.mockImplementation(async(cmd:string)=>cmd==='fusen_trash_cleanup_status'?false:cmd==='fusen_trash_cleanup_preview'?preview:undefined)});
afterEach(cleanup);
it('51件目以降も確認できる',async()=>{
 const many={...preview,items:Array.from({length:51},(_,i)=>({...preview.items[0],path:`Trash/${i}.md`}))};
 ipc.invoke.mockImplementation(async(cmd:string)=>cmd==='fusen_trash_cleanup_status'?false:many);
 render(<TrashRetentionSettings language="ja"/>);
 fireEvent.click(screen.getByRole('button',{name:'対象を確認する'}));
 const more=await screen.findByRole('button',{name:'さらに50件を表示する'});
 expect(screen.queryByText(/Trash\/50.md/)).toBeNull();
 fireEvent.click(more);
 expect(screen.getByText(/Trash\/50.md/)).toBeTruthy();
 expect(screen.queryByRole('button',{name:'さらに50件を表示する'})).toBeNull();
});
it('初期OFFで、対象を確認するまで有効化も削除も行わない',async()=>{
 render(<TrashRetentionSettings basePath="vault" language="ja"/>);
 await waitFor(()=>expect(ipc.invoke).toHaveBeenCalledWith('fusen_trash_cleanup_status'));
 const enable=screen.getByRole('button',{name:'90日後の自動整理を有効にする'}) as HTMLButtonElement;
 expect(enable.disabled).toBe(true);
 expect(ipc.invoke).not.toHaveBeenCalledWith('fusen_trash_cleanup_preview');
 fireEvent.click(screen.getByRole('button',{name:'対象を確認する'}));
 await screen.findByText(/移動日不明のため保持/);
 expect(enable.disabled).toBe(false);
 fireEvent.click(enable);
 await screen.findByText('自動整理を有効にしました。');
 expect(ipc.invoke).toHaveBeenCalledWith('fusen_set_trash_cleanup',{enabled:true,token:'reviewed'});
 fireEvent.click(screen.getByRole('button',{name:'自動整理を停止する'}));
 await screen.findByText('自動整理を停止しました。');
 expect(ipc.invoke).toHaveBeenCalledWith('fusen_set_trash_cleanup',{enabled:false,token:null});
});
it('削除確認をキャンセルすると削除APIを呼ばない',async()=>{
 render(<TrashRetentionSettings language="ja"/>);
 fireEvent.click(screen.getByRole('button',{name:'対象を確認する'}));
 fireEvent.click(await screen.findByRole('button',{name:'確認した90日経過分を削除する'}));
 await screen.findByRole('dialog');
 fireEvent.click(screen.getByRole('button',{name:'キャンセル'}));
 expect(screen.queryByRole('dialog')).toBeNull();
 expect(ipc.invoke.mock.calls.some(c=>c[0]==='fusen_trash_cleanup_run')).toBe(false);
});
it('削除失敗・部分完了を成功だけと表示せず、再確認を要求する',async()=>{
 ipc.invoke.mockImplementation(async(cmd:string)=>cmd==='fusen_trash_cleanup_status'?false:cmd==='fusen_trash_cleanup_preview'?preview:{deletedNotes:1,deletedAssets:0,errors:['locked']});
 render(<TrashRetentionSettings language="ja"/>);
 fireEvent.click(screen.getByRole('button',{name:'対象を確認する'}));
 fireEvent.click(await screen.findByRole('button',{name:'確認した90日経過分を削除する'}));
 fireEvent.click(screen.getByRole('button',{name:'完全に削除する'}));
 await screen.findByText(/途中で停止しました/);
 expect(ipc.invoke).toHaveBeenCalledWith('fusen_trash_cleanup_run',{token:'reviewed'});
 expect(screen.queryByRole('button',{name:'確認した90日経過分を削除する'})).toBeNull();
});
it('確認失敗では有効化しない',async()=>{
 ipc.invoke.mockImplementation(async(cmd:string)=>{if(cmd==='fusen_trash_cleanup_status')return false;throw Error('read failed')});
 render(<TrashRetentionSettings language="en"/>);
 fireEvent.click(screen.getByRole('button',{name:'Review Trash'}));
 await screen.findByText('Cleanup is stopped because Trash could not be checked safely. No files were deleted. Preserve the history before checking it.');
 expect((screen.getByRole('button',{name:'Enable 90-day automatic cleanup'}) as HTMLButtonElement).disabled).toBe(true);
});
it('設定がオンでも履歴が壊れていれば安全停止中と表示する',async()=>{
 ipc.invoke.mockImplementation(async(cmd:string)=>{if(cmd==='fusen_trash_cleanup_status')return true;if(cmd==='fusen_trash_cleanup_health')throw Error('broken');return undefined});
 render(<TrashRetentionSettings language="ja"/>);
 await screen.findByText(/オン・安全停止中/);
 expect(ipc.invoke.mock.calls.some(c=>c[0]==='fusen_trash_cleanup_run')).toBe(false);
});
