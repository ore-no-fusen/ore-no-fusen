import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNoteFile } from './useNoteFile';
const { save, read } = vi.hoisted(() => ({save:vi.fn(),read:vi.fn()}));
vi.mock('@/app/api/notes',()=>({readNote:read,saveNote:save}));
vi.mock('@sentry/nextjs',()=>({captureMessage:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke:vi.fn()}));
beforeEach(()=>{save.mockReset();read.mockReset();vi.spyOn(console,'log').mockImplementation(()=>{});vi.spyOn(console,'error').mockImplementation(()=>{});});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
describe('save completion for feature usage',()=>{
  it('returns false without writing when an existing note has not loaded',async()=>{
    const {result}=renderHook(()=>useNoteFile({path:'C:/notes/a.md',isNew:false}));
    let saved: boolean | undefined;
    await act(async()=>{saved=await result.current.saveNoteContent('body','---\n---',false);});
    expect(saved).toBe(false);expect(save).not.toHaveBeenCalled();
  });
  it('returns true only after the actual write succeeds and propagates write failure',async()=>{
    const {result}=renderHook(()=>useNoteFile({path:'C:/notes/a.md',isNew:true}));
    save.mockResolvedValue('C:/notes/a.md');
    let saved: boolean | undefined;
    await act(async()=>{saved=await result.current.saveNoteContent('body','---\n---',false);});
    expect(saved).toBe(true);
    save.mockRejectedValue(new Error('write failed'));
    await expect(result.current.saveNoteContent('changed','---\n---',false)).rejects.toThrow('write failed');
  });
});

describe('iPhone return and delayed auto-save',()=>{
  const staleError = 'iPhoneから反映した後に付箋が更新されました。古い画面の保存を止めました。付箋を開き直してください。';

  it('stops retrying without a false warning when the returned body is already on disk',async()=>{
    vi.useFakeTimers();
    const onSaveError=vi.fn();
    save.mockRejectedValue(staleError);
    read.mockResolvedValue({body:'---\niphone_return_hash: receipt\n---\n\n返送本文'});
    const {result}=renderHook(()=>useNoteFile({path:'C:/notes/a.md',isNew:true,onSaveError}));
    act(()=>{result.current.setContent('返送本文');result.current.setRawFrontmatter('---\n---');result.current.setSavePending(true);});
    await act(async()=>{await vi.advanceTimersByTimeAsync(810);});
    expect(read).toHaveBeenCalledWith('C:/notes/a.md');
    expect(result.current.rawFrontmatter).toContain('iphone_return_hash: receipt');
    expect(onSaveError).not.toHaveBeenCalled();
    await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('keeps different unsaved editor text and warns without retrying',async()=>{
    vi.useFakeTimers();
    const onSaveError=vi.fn();
    save.mockRejectedValue(staleError);
    read.mockResolvedValue({body:'---\niphone_return_hash: receipt\n---\n\n返送本文'});
    const {result}=renderHook(()=>useNoteFile({path:'C:/notes/a.md',isNew:true,onSaveError}));
    act(()=>{result.current.setContent('PCで追記');result.current.setRawFrontmatter('---\n---');result.current.setSavePending(true);});
    await act(async()=>{await vi.advanceTimersByTimeAsync(810);});
    expect(result.current.content).toBe('PCで追記');
    expect(onSaveError).toHaveBeenCalledTimes(1);
    await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe('reload after a new PC note is renamed',()=>{
  it('reads the returned file even when the rename skip is still pending',async()=>{
    save.mockResolvedValue('C:/notes/test.md');
    read.mockResolvedValue({body:'---\niphone_return_hash: receipt\n---\n\ntest\n- [x] 5',meta:{opacity:1}});
    const onPathChange=vi.fn();
    const {result,rerender}=renderHook(({path})=>useNoteFile({path,isNew:true,onPathChange}),{
      initialProps:{path:'C:/notes/untitled.md'},
    });
    await act(async()=>{await result.current.saveNoteContent('test\n- [ ] 5','---\n---',true);});
    expect(onPathChange).toHaveBeenCalledWith('C:/notes/test.md');
    rerender({path:'C:/notes/test.md'});
    let body='';
    await act(async()=>{body=await result.current.loadNote(true);});
    expect(read).toHaveBeenCalledWith('C:/notes/test.md');
    expect(body).toBe('test\n- [x] 5');
    expect(result.current.content).toBe('test\n- [x] 5');
  });

  it('still skips the immediate reload caused only by renaming',async()=>{
    save.mockResolvedValue('C:/notes/test.md');
    const {result,rerender}=renderHook(({path})=>useNoteFile({path,isNew:true}),{
      initialProps:{path:'C:/notes/untitled.md'},
    });
    await act(async()=>{await result.current.saveNoteContent('test','---\n---',true);});
    rerender({path:'C:/notes/test.md'});
    let body='';
    await act(async()=>{body=await result.current.loadNote();});
    expect(body).toBe('test');
    expect(read).not.toHaveBeenCalled();
  });
});
