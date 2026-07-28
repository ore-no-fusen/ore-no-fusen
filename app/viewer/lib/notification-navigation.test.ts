import { describe, expect, it, vi } from 'vitest';
import {
  consumePendingNotification,
  getNotificationNoteId,
  loadNotificationDraft,
  removeNotificationNoteParam,
} from './notification-navigation';
import type { DraftRecord } from '../types';

const draft = { id: 'target-note', title: 'target', body: 'body' } as DraftRecord;

describe('notification navigation', () => {
  it('URLで指定された通知IDを他のクエリより優先して取得する', () => {
    expect(getNotificationNoteId('?debug=1&note=target-note')).toBe('target-note');
  });

  it('保存直後に読めなくても対象IDだけを再試行する', async () => {
    const loader = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(draft);
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(loadNotificationDraft('target-note', loader, wait)).resolves.toBe(draft);
    expect(loader).toHaveBeenCalledTimes(3);
    expect(loader).toHaveBeenCalledWith('target-note');
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it('取得できない場合はnullを返し、呼び出し側が遷移情報を保持できる', async () => {
    const loader = vi.fn().mockResolvedValue(null);
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(loadNotificationDraft('missing-note', loader, wait)).resolves.toBeNull();
    expect(loader).toHaveBeenCalledTimes(4);
  });

  it('pending_openは対象付箋を取得できた後だけ削除する', async () => {
    const clearPending = vi.fn().mockResolvedValue(undefined);
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(consumePendingNotification(
      'missing-note',
      vi.fn().mockResolvedValue(null),
      clearPending,
      wait,
    )).resolves.toBeNull();
    expect(clearPending).not.toHaveBeenCalled();

    await expect(consumePendingNotification(
      'target-note',
      vi.fn().mockResolvedValue(draft),
      clearPending,
      wait,
    )).resolves.toBe(draft);
    expect(clearPending).toHaveBeenCalledOnce();
  });

  it('成功後にnoteだけをURLから除き、他のクエリとhashを保持する', () => {
    expect(removeNotificationNoteParam('https://example.com/viewer?note=target-note&debug=1#top'))
      .toBe('/viewer?debug=1#top');
  });
});
