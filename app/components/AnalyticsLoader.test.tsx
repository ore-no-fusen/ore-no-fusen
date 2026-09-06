import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import React from 'react';

const { invokeMock, windowLabel } = vi.hoisted(() => ({ invokeMock: vi.fn(), windowLabel: { value: 'main' } }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async()=>vi.fn()) }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ label: windowLabel.value }) }));
import AnalyticsLoader from './AnalyticsLoader';

describe('AnalyticsLoader low-impact scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers(); invokeMock.mockReset(); windowLabel.value='main';
    delete (window as any).gtag; delete (window as any).dataLayer; delete (window as any).__FUSEN_ANALYTICS_GRANTED__;
    document.querySelectorAll('[data-fusen-analytics="ga4"]').forEach(node=>node.remove());
    invokeMock.mockImplementation((command:string)=>{
      if(command==='get_settings')return Promise.resolve({analytics_consent:'granted'});
      if(command==='member_needs_sync')return Promise.resolve(false);
      if(command==='member_get')return Promise.resolve({analyticsSubject:'0123456789abcdef0123456789abcdef',consent:true});
      if(command==='member_closed_summaries')return Promise.resolve([]);
      return Promise.resolve(undefined);
    });
  });
  afterEach(()=>{cleanup();vi.useRealTimers();});

  it('does not load GA4 or call the member network path during the first minute', async()=>{
    render(<AnalyticsLoader isTauriBuild/>);
    await vi.advanceTimersByTimeAsync(0);
    expect(invokeMock).toHaveBeenCalledWith('get_settings');
    expect(document.querySelector('[data-fusen-analytics="ga4"]')).toBeNull();
    expect(invokeMock).not.toHaveBeenCalledWith('member_needs_sync');
  });

  it('starts member and weekly analysis work only after the quiet period', async()=>{
    render(<AnalyticsLoader isTauriBuild/>);
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(invokeMock).toHaveBeenCalledWith('member_closed_summaries');
    expect(document.querySelector('[data-fusen-analytics="ga4"]')).not.toBeNull();
  });

  it('runs only in the main Tauri window', async()=>{
    windowLabel.value='note-2';
    render(<AnalyticsLoader isTauriBuild/>);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('queues a closed-week feature summary and removes it only after queueing',async()=>{
    invokeMock.mockImplementation((command:string)=>{
      if(command==='get_settings')return Promise.resolve({analytics_consent:'granted'});
      if(command==='member_needs_sync')return Promise.resolve(false);
      if(command==='member_get')return Promise.resolve({analyticsSubject:'0123456789abcdef0123456789abcdef',consent:true});
      if(command==='member_closed_summaries')return Promise.resolve([{
        week:'2026-W35',schema:1,appVersion:'5.2.1',
        features:{note_edited:{count:12,activeDays:['2026-08-25','2026-08-27'],lastUsedDay:'2026-08-27'}},
      }]);
      return Promise.resolve(undefined);
    });
    render(<AnalyticsLoader isTauriBuild/>);
    await vi.advanceTimersByTimeAsync(60_000); await vi.advanceTimersByTimeAsync(0);
    const commands=(window as any).dataLayer.map((entry:ArrayLike<unknown>)=>Array.from(entry));
    expect(commands).toContainEqual(['event','weekly_feature_usage',expect.objectContaining({summary_week:'2026-W35',feature_name:'note_edited',usage_count:12,active_days:2,last_used_day:'2026-08-27'})]);
    expect(commands).toContainEqual(['event','weekly_usage_complete',expect.objectContaining({summary_week:'2026-W35'})]);
    expect(invokeMock).toHaveBeenCalledWith('member_mark_summary_sent',{week:'2026-W35'});
  });
});
