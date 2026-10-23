import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VisibleImage } from './VisibleImage';

let visibility: (entries:{isIntersecting:boolean}[])=>void;
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback:typeof visibility) { visibility=callback; }
    observe=vi.fn(); disconnect=vi.fn();
  });
  URL.revokeObjectURL=vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('visible image ownership', () => {
  it('releases images on pagehide even when the browser keeps the page alive',async()=>{
    const load=vi.fn(async (_signal:AbortSignal)=>'blob:bfcache');
    render(<VisibleImage load={load} alt="写真" display="block"/>);
    act(()=>visibility([{isIntersecting:true}]));await screen.findByRole('img');
    act(()=>window.dispatchEvent(new Event('pagehide')));
    expect(load.mock.calls[0][0].aborted).toBe(true);expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:bfcache');
    expect(screen.queryByRole('img')).toBeNull();
  });
  it('downloads only while visible, aborts and releases the URL when hidden', async () => {
    const load=vi.fn(async (_signal:AbortSignal)=>'blob:preview');
    render(<VisibleImage load={load} alt="写真" display="block"/>);
    expect(load).not.toHaveBeenCalled();
    act(()=>visibility([{isIntersecting:true}]));
    await waitFor(()=>expect(screen.getByRole('img').getAttribute('src')).toBe('blob:preview'));
    act(()=>visibility([{isIntersecting:false}]));
    expect(load.mock.calls[0][0].aborted).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    expect(screen.queryByRole('img')).toBeNull();
  });
  it('releases a late result after unmount instead of retaining it', async () => {
    let finish!:(url:string)=>void;
    const load=vi.fn((_signal:AbortSignal)=>new Promise<string>(resolve=>{finish=resolve;}));
    const view=render(<VisibleImage load={load} alt="写真" display="block"/>);
    act(()=>visibility([{isIntersecting:true}]));
    view.unmount();
    await act(async()=>{finish('blob:late');});
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:late');
  });
});
