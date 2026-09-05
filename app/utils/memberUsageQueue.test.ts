import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const { invokeMock }=vi.hoisted(()=>({invokeMock:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke:invokeMock}));
import { countMemberFeature } from './memberUsageQueue';

describe('member usage queue',()=>{
  beforeEach(()=>{vi.useFakeTimers();invokeMock.mockReset().mockResolvedValue(undefined);});
  afterEach(()=>vi.useRealTimers());
  it('does no IPC for the foreground actions and sends one delayed batch',async()=>{
    for(let i=0;i<100;i++)countMemberFeature('note_edited');
    expect(invokeMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('member_record_batch',{counts:{note_edited:100}});
  });
});
