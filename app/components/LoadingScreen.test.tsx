import React from 'react';
import {act, cleanup, render, waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import LoadingScreen from './LoadingScreen';
const mocks=vi.hoisted(()=>({invoke:vi.fn(),show:vi.fn(),setSize:vi.fn(),center:vi.fn(),setFocus:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke:mocks.invoke}));
vi.mock('@tauri-apps/api/window',()=>({getCurrentWindow:()=>({label:'main',show:mocks.show,setSize:mocks.setSize,center:mocks.center,setFocus:mocks.setFocus})}));
describe('startup screen visibility',()=>{
  beforeEach(()=>{vi.clearAllMocks();});
  afterEach(cleanup);
  it('shows the startup screen for existing settings without the new preference',async()=>{
    mocks.invoke.mockResolvedValue({});render(<LoadingScreen/>);await waitFor(()=>expect(mocks.show).toHaveBeenCalledTimes(1));
  });
  it('does not resize, focus or show the main window when disabled',async()=>{
    mocks.invoke.mockResolvedValue({show_startup_screen:false});render(<LoadingScreen/>);
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,180));});
    expect(mocks.invoke).toHaveBeenCalledWith('get_settings');expect(mocks.show).not.toHaveBeenCalled();expect(mocks.setSize).not.toHaveBeenCalled();expect(mocks.setFocus).not.toHaveBeenCalled();
  });
  it('shows startup failures even when ordinary startup progress is disabled',async()=>{
    mocks.invoke.mockResolvedValue({show_startup_screen:false});render(<LoadingScreen forceVisible message="復元失敗"/>);
    await waitFor(()=>expect(mocks.show).toHaveBeenCalledTimes(1));
  });
  it('never shows a late splash after the loading screen has unmounted',async()=>{
    let done!:(value:unknown)=>void;mocks.invoke.mockReturnValue(new Promise(resolve=>{done=resolve;}));
    const view=render(<LoadingScreen/>);await waitFor(()=>expect(mocks.invoke).toHaveBeenCalled());view.unmount();
    await act(async()=>{done({show_startup_screen:true});await new Promise(resolve=>setTimeout(resolve,150));});expect(mocks.show).not.toHaveBeenCalled();
  });
  it('設定画面へ切り替わった後に起動サイズへ戻さない',async()=>{
    mocks.invoke.mockResolvedValue({show_startup_screen:true});const view=render(<LoadingScreen/>);
    await waitFor(()=>expect(mocks.invoke).toHaveBeenCalled());view.unmount();
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,180));});
    expect(mocks.setSize).not.toHaveBeenCalled();expect(mocks.show).not.toHaveBeenCalled();
  });
});
