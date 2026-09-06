import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNoteFile } from './useNoteFile';
const { save } = vi.hoisted(() => ({save:vi.fn()}));
vi.mock('@/app/api/notes',()=>({readNote:vi.fn(),saveNote:save}));
vi.mock('@sentry/nextjs',()=>({captureMessage:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke:vi.fn()}));
beforeEach(()=>{save.mockReset();vi.spyOn(console,'log').mockImplementation(()=>{});vi.spyOn(console,'error').mockImplementation(()=>{});});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
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
