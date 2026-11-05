import { describe, expect, it } from 'vitest';
import { enqueueObservedTask, isDuplicateWindowCreationRequest } from './windowCreation';

describe('windowCreation', () => {
  it('detects repeated requests for a label that is still being created', () => {
    const inProgress = new Set(['note-active']);

    expect(isDuplicateWindowCreationRequest('note-active', inProgress)).toBe(true);
    expect(isDuplicateWindowCreationRequest('note-other', inProgress)).toBe(false);
  });
  it('reports a failed placement to its caller and continues the next task', async () => {
    const queue = { queue: [] as Array<() => Promise<void>>, processing: true };
    const first = enqueueObservedTask(queue, async () => { throw new Error('placement failed'); }, () => {});
    let nextRan = false;
    const second = enqueueObservedTask(queue, async () => { nextRan = true; }, () => {});
    await queue.queue.shift()!();
    await expect(first).rejects.toThrow('placement failed');
    await queue.queue.shift()!();
    await expect(second).resolves.toBeUndefined();
    expect(nextRan).toBe(true);
  });
});
