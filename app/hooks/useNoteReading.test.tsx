import React, {useRef} from 'react';
import {render, cleanup, act} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {useNoteReading} from './useNoteReading';
const {track}=vi.hoisted(()=>({track:vi.fn()}));
vi.mock('../utils/analytics',()=>({trackEvent:track}));
function View({enabled=true,noteKey='note'}:{enabled?:boolean;noteKey?:string}) {
  const ref=useRef<HTMLDivElement>(null);useNoteReading(ref,noteKey,enabled);
  return <div ref={ref}>body</div>;
}
let handlers:Map<string,EventListener>;
beforeEach(()=>{
  vi.useFakeTimers();track.mockClear();handlers=new Map();
  vi.spyOn(document,'addEventListener').mockImplementation((name,listener)=>{if(typeof listener==='function')handlers.set(name,listener);});
  vi.spyOn(document,'hasFocus').mockReturnValue(true);
  vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');
  Object.assign(window,{__TAURI__: {},__FUSEN_ANALYTICS_GRANTED__:true});
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();delete (window as any).__TAURI__;delete (window as any).__FUSEN_ANALYTICS_GRANTED__;});
function interact(target:Element,trusted=true){act(()=>handlers.get('pointerdown')?.({target,isTrusted:trusted} as unknown as Event));}
function advance(ms=5000){act(()=>vi.advanceTimersByTime(ms));}
it('counts only after intentional content interaction and five foreground seconds, once per UTC day',()=>{
  const view=render(<View/>);advance();expect(track).not.toHaveBeenCalled();
  interact(view.getByText('body'),false);advance();expect(track).not.toHaveBeenCalled();
  interact(document.body);advance();expect(track).not.toHaveBeenCalled();
  interact(view.getByText('body'));advance(4999);expect(track).not.toHaveBeenCalled();advance(1);
  expect(track).toHaveBeenCalledExactlyOnceWith('feature_used',{feature_name:'note_read'});
  interact(view.getByText('body'));advance();expect(track).toHaveBeenCalledTimes(1);
});
it('cancels on blur, hidden state, note change and unmount; focus alone cannot restart',()=>{
  const view=render(<View/>);interact(view.getByText('body'));
  act(()=>window.dispatchEvent(new Event('blur')));advance();expect(track).not.toHaveBeenCalled();
  interact(view.getByText('body'));act(()=>handlers.get('visibilitychange')?.(new Event('visibilitychange')));advance();expect(track).not.toHaveBeenCalled();
  interact(view.getByText('body'));view.rerender(<View noteKey="other"/>);advance();expect(track).not.toHaveBeenCalled();
  interact(view.getByText('body'));view.unmount();advance();expect(track).not.toHaveBeenCalled();
});
it('requires consent, foreground and a loaded eligible note at both interaction and completion',()=>{
  const view=render(<View enabled={false}/>);expect(handlers.has('pointerdown')).toBe(false);
  view.rerender(<View/>);(window as any).__FUSEN_ANALYTICS_GRANTED__=false;
  interact(view.getByText('body'));advance();expect(track).not.toHaveBeenCalled();
  (window as any).__FUSEN_ANALYTICS_GRANTED__=true;interact(view.getByText('body'));
  (window as any).__FUSEN_ANALYTICS_GRANTED__=false;advance();expect(track).not.toHaveBeenCalled();
  (window as any).__FUSEN_ANALYTICS_GRANTED__=true;vi.mocked(document.hasFocus).mockReturnValue(false);
  interact(view.getByText('body'));advance();expect(track).not.toHaveBeenCalled();
});
