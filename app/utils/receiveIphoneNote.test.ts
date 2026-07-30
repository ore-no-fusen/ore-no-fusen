import { describe, expect, it, vi } from 'vitest';
import { receiveIphoneNote } from './receiveIphoneNote';

function createActions(overrides: Partial<Parameters<typeof receiveIphoneNote>[1]> = {}) {
  return {
    hasSavedNote: vi.fn().mockResolvedValue(false),
    downloadImages: vi.fn().mockResolvedValue('stored-image-body'),
    createNote: vi.fn().mockResolvedValue({ note: { meta: { path: 'notes/from-iphone.md' } }, created: true }),
    addTag: vi.fn().mockResolvedValue(undefined),
    waitBeforeTagRetry: vi.fn().mockResolvedValue(undefined),
    openCreatedNote: vi.fn().mockResolvedValue(undefined),
    acknowledge: vi.fn().mockResolvedValue(undefined),
    onTagFailure: vi.fn(),
    ...overrides,
  };
}

describe('receiveIphoneNote', () => {
  it('R16 stores assets and creates the PC note before acknowledging the iPhone queue', async () => {
    const order: string[] = [];
    const actions = createActions({
      downloadImages: vi.fn().mockImplementation(async () => { order.push('assets'); return 'stored-image-body'; }),
      createNote: vi.fn().mockImplementation(async () => { order.push('note'); return { note: { meta: { path: 'notes/from-iphone.md' } }, created: true }; }),
      openCreatedNote: vi.fn().mockImplementation(async () => { order.push('window'); }),
      acknowledge: vi.fn().mockImplementation(async () => { order.push('ack'); }),
    });

    await receiveIphoneNote({ id: 'iphone-1', title: 'title', body: 'remote-image-body', context: 'context' }, actions);

    expect(order).toEqual(['assets', 'note', 'window', 'ack']);
  });

  it('does not acknowledge the iPhone queue when asset storage fails', async () => {
    const actions = createActions({
      downloadImages: vi.fn().mockRejectedValue(new Error('image download failed')),
    });

    await expect(receiveIphoneNote({ id: 'iphone-1', title: 'title', body: 'remote-image-body', context: 'context' }, actions))
      .rejects.toThrow('image download failed');
    expect(actions.createNote).not.toHaveBeenCalled();
    expect(actions.acknowledge).not.toHaveBeenCalled();
  });
});
