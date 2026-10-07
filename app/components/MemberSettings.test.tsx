import React from 'react';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
const ipc = vi.hoisted(()=>({invoke:vi.fn(),handlers:new Map<string,(e:any)=>void>()}));
vi.mock('@tauri-apps/api/core',()=>({invoke:ipc.invoke}));
vi.mock('@tauri-apps/api/event',()=>({listen:vi.fn(async(name:string,handler:any)=>{ipc.handlers.set(name,handler);return ()=>ipc.handlers.delete(name);})}));
import MemberSettings from './MemberSettings';
beforeEach(()=>{ipc.handlers.clear();ipc.invoke.mockReset();ipc.invoke.mockImplementation(async(command:string)=>command==='get_settings'?{analytics_consent:'granted',language:'ja'}:{generalNumber:10000});});
afterEach(cleanup);
it('初回と同じ設定として表示し、停止時にサーバー同期も行う',async()=>{
 render(<MemberSettings language="ja"/>);
 await screen.findByText('現在の設定：協力する');
 expect(screen.getByText(/初回に選んだ利用情報の送信設定/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'送信しない・停止する'}));
 await screen.findByText('現在の設定：送信しない');
 await waitFor(()=>expect(ipc.invoke).toHaveBeenCalledWith('member_sync_usage'));
 expect(ipc.invoke).toHaveBeenCalledWith('save_settings',{settings:{analytics_consent:'denied',language:'ja'}});
 expect(ipc.invoke).not.toHaveBeenCalledWith('member_set_consent',expect.anything());
});
it('別画面の設定変更を受けて表示を更新する',async()=>{
 render(<MemberSettings language="ja"/>);
 await screen.findByText('現在の設定：協力する');
 ipc.invoke.mockResolvedValue({generalNumber:10000,consent:false});
 ipc.handlers.get('settings_updated')?.({payload:{analytics_consent:'denied'}});
 await screen.findByText('現在の設定：送信しない');
});
it('保存失敗を成功と表示しない',async()=>{
 render(<MemberSettings language="ja"/>);
 await screen.findByText('現在の設定：協力する');
 ipc.invoke.mockRejectedValue(new Error('save failed'));
 fireEvent.click(screen.getByRole('button',{name:'送信しない・停止する'}));
 await screen.findByRole('status');
 expect(screen.getByText('現在の設定：協力する')).toBeTruthy();
});
