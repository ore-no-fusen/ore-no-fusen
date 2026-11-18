import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Note } from '@/app/api/notes';
import { useNoteStyles } from './useNoteStyles';

vi.mock('@/lib/settings-store', () => ({ useSettings: () => ({ settings: { font_size: 16 } }) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
afterEach(cleanup);
const note = (color?: string): Note => ({meta: {path:'test.md',seq:1,context:'',updated:'',background_color:color},body:'本文',frontmatter:''});

describe('製品の付箋背景色の読込', () => {
  it('読み込む前と色指定なしでは黄色を表示する', () => {
    const {result,rerender}=renderHook(({value}:{value:Note|null})=>useNoteStyles(value),{initialProps:{value:null as Note|null}});
    expect(result.current.noteBackgroundColor).toBe('#f7e9b0');
    rerender({value:note()});
    expect(result.current.noteBackgroundColor).toBe('#f7e9b0');
  });
  it('読込済みの色を適用し、再読込で変わった色も反映する', async () => {
    const {result,rerender}=renderHook(({value})=>useNoteStyles(value),{initialProps:{value:note('#ffcdd2')}});
    await waitFor(()=>expect(result.current.noteBackgroundColor).toBe('#ffcdd2'));
    rerender({value:note('#e8f5e9')});
    await waitFor(()=>expect(result.current.noteBackgroundColor).toBe('#e8f5e9'));
  });
});
