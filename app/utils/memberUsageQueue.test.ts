import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const { invokeMock }=vi.hoisted(()=>({invokeMock:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke:invokeMock}));
import { clearMemberFeatureQueue, countMemberFeature } from './memberUsageQueue';

describe('member usage queue',()=>{
  beforeEach(()=>{clearMemberFeatureQueue();vi.useFakeTimers();vi.stubGlobal('crypto',{randomUUID:vi.fn(()=> '00000000-0000-4000-8000-000000000001')});invokeMock.mockReset().mockResolvedValue(undefined);});
  afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
  it('does no IPC inside foreground actions and sends one durable batch immediately after them',async()=>{
    for(let i=0;i<100;i++)countMemberFeature('note_edited');
    expect(invokeMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('member_record_batch',{batchId:'00000000-0000-4000-8000-000000000001',counts:{note_edited:100}});
  });
  it('retries a failed batch with the same id and counts',async()=>{
    invokeMock.mockRejectedValueOnce(new Error('temporary IPC failure')).mockResolvedValueOnce(undefined);
    countMemberFeature('note_edited');
    await vi.advanceTimersByTimeAsync(0);
    const first=invokeMock.mock.calls[0];
    await vi.advanceTimersByTimeAsync(60_000);
    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock.mock.calls[1]).toEqual(first);
  });
  it('drops a failed retry when consent is withdrawn',async()=>{
    invokeMock.mockRejectedValueOnce(new Error('temporary IPC failure'));
    countMemberFeature('note_edited');
    await vi.advanceTimersByTimeAsync(0);
    clearMemberFeatureQueue();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });
  it('clears queued observations immediately when consent is withdrawn',async()=>{
    countMemberFeature('note_edited');clearMemberFeatureQueue();await vi.advanceTimersByTimeAsync(0);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
