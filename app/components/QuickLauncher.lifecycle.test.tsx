import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
const mocks=vi.hoisted(()=>({hide:vi.fn(),open:vi.fn(),listen:vi.fn(),top:vi.fn(),sync:vi.fn()}));
vi.mock('@tauri-apps/api/window',()=>({getCurrentWindow:()=>({hide:mocks.hide,isAlwaysOnTop:async()=>true,setAlwaysOnTop:mocks.top})}));
vi.mock('../utils/pinToggleSound',()=>({playPinToggleSound:vi.fn()}));
vi.mock('@tauri-apps/api/event',()=>({listen:mocks.listen}));
vi.mock('@/lib/settings-store',()=>({useSettings:()=>({settings:{language:'ja'}})}));
vi.mock('../api/launcher',()=>({
  storageSnapshot:async()=>({paths:[],items:[],tags:[]}),
  getLauncherState:async()=>({last_tab:'shortcut',orders:{},selected_tags:{}}),
  quickOpenNotes:async()=>[{path:'C:/test.md',title:'試験付箋',tags:['shortcut'],launches:0,is_recipe:false}],
  openQuickNote:mocks.open,setLauncherLastTab:vi.fn(),setLauncherTagFilter:vi.fn(),
  storeQuickNote:vi.fn(),storeTag:vi.fn(),removeFromShelf:vi.fn(),renameQuickNote:vi.fn(),reorderQuickNote:vi.fn(),syncQuickLauncherToWeb:mocks.sync,
}));
import QuickLauncher from './QuickLauncher';
describe('launcher explicit close',()=>{
  beforeEach(()=>{mocks.hide.mockReset().mockResolvedValue(undefined);mocks.open.mockReset().mockResolvedValue(undefined);mocks.listen.mockReset().mockResolvedValue(()=>{});mocks.top.mockReset().mockResolvedValue(undefined);});
  afterEach(cleanup);
  it('shows sync stages and elapsed time without changing the held result',async()=>{
    let finish!: (value: unknown) => void;
    mocks.sync.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    render(<QuickLauncher/>);
    fireEvent.click(await screen.findByRole('button',{name:'↻ 同期'}));
    await waitFor(()=>expect(mocks.sync).toHaveBeenCalled());
    const progress=mocks.listen.mock.calls.find(args=>args[0]==='fusen:web_sync_progress')?.[1];
    act(()=>progress({payload:'history'}));
    expect(screen.getByRole('status').textContent).toContain('共有記録を取得');
    act(()=>progress({payload:'apply'}));
    expect(screen.getByRole('status').textContent).toContain('付箋を確認');
    await act(async()=>finish({uploaded:0,applied:0,revoked:0,unchanged:9,held:['重複IDは保留']}));
    expect(screen.getByRole('status').textContent).toMatch(/Web同期（[\d.]+秒）.*9件は変更なし.*重複IDは保留/);
    expect((screen.getByRole('button',{name:'↻ 同期'}) as HTMLButtonElement).disabled).toBe(false);
  });
  it('stays visible after losing focus and opening a note',async()=>{
    render(<QuickLauncher/>);
    const row=await screen.findByText('試験付箋',{exact:true});
    fireEvent(window,new Event('blur'));
    fireEvent.click(row);
    await waitFor(()=>expect(mocks.open).toHaveBeenCalledWith('C:/test.md'));
    expect(mocks.hide).not.toHaveBeenCalled();
    expect(screen.getByRole('button',{name:'ランチャーを閉じる'})).toBeTruthy();
  });
  it('hides only on the close button and does not modify a note',async()=>{
    render(<QuickLauncher/>);
    fireEvent.click(await screen.findByRole('button',{name:'ランチャーを閉じる'}));
    await waitFor(()=>expect(mocks.hide).toHaveBeenCalledTimes(1));
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it('also permits explicit Escape from the search field',async()=>{
    render(<QuickLauncher/>);
    fireEvent.keyDown(await screen.findByPlaceholderText('検索'),{key:'Escape'});
    await waitFor(()=>expect(mocks.hide).toHaveBeenCalledTimes(1));
  });
  it('turns off always-on-top without enabling blur auto-close',async()=>{
    render(<QuickLauncher/>);
    const pin=await screen.findByRole('button',{name:'最前面'});
    await waitFor(()=>expect((pin as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(pin);
    await waitFor(()=>expect(pin.getAttribute('aria-pressed')).toBe('false'));
    expect(mocks.top).toHaveBeenCalledWith(false);
    fireEvent(window,new Event('blur'));
    expect(mocks.hide).not.toHaveBeenCalled();
  });
  it('keeps the pin state when the operating system rejects the change',async()=>{
    mocks.top.mockRejectedValueOnce(new Error('rejected'));
    render(<QuickLauncher/>);
    const pin=await screen.findByRole('button',{name:'最前面'});
    await waitFor(()=>expect((pin as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(pin);
    await screen.findByText('最前面の設定を変更できませんでした。');
    expect(pin.getAttribute('aria-pressed')).toBe('true');
    expect(mocks.hide).not.toHaveBeenCalled();
  });
});
