import { describe, expect, it, vi } from 'vitest';
import {
  consumePendingNotification,
  createSingleFlightEventHandler,
  getNotificationNoteId,
  loadNotificationDraft,
  removeNotificationNoteParam,
  registerPendingNotificationResume,
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

  it('各読込のmissing・error・foundを本文なしで通知する', async () => {
    const loader = vi.fn()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('秘密の本文'))
      .mockResolvedValueOnce(draft);
    const wait = vi.fn().mockResolvedValue(undefined);
    const onAttempt = vi.fn();

    await loadNotificationDraft('target-note', loader, wait, onAttempt);

    expect(onAttempt.mock.calls.map(([value]) => ({
      attempt: value.attempt,
      result: value.result,
      errorName: value.errorName,
    }))).toEqual([
      { attempt: 1, result: 'missing', errorName: undefined },
      { attempt: 2, result: 'error', errorName: 'Error' },
      { attempt: 3, result: 'found', errorName: undefined },
    ]);
    expect(JSON.stringify(onAttempt.mock.calls)).not.toContain('秘密の本文');
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

  it('checks the pending note on every iPhone resume event', () => {
    const documentTarget = new EventTarget();
    const windowTarget = new EventTarget();
    const handler = vi.fn();
    const unregister = registerPendingNotificationResume(handler, documentTarget, windowTarget);

    documentTarget.dispatchEvent(new Event('visibilitychange'));
    windowTarget.dispatchEvent(new Event('focus'));
    windowTarget.dispatchEvent(new Event('pageshow'));
    expect(handler).toHaveBeenCalledTimes(3);

    unregister();
    windowTarget.dispatchEvent(new Event('focus'));
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('coalesces simultaneous iPhone resume events into one pending-note check', async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const checkPending = vi.fn().mockReturnValue(pending);
    const handler = createSingleFlightEventHandler(checkPending);
    const documentTarget = new EventTarget();
    const windowTarget = new EventTarget();
    const unregister = registerPendingNotificationResume(handler, documentTarget, windowTarget);

    documentTarget.dispatchEvent(new Event('visibilitychange'));
    windowTarget.dispatchEvent(new Event('focus'));
    windowTarget.dispatchEvent(new Event('pageshow'));
    expect(checkPending).toHaveBeenCalledTimes(1);

    finish();
    await pending;
    await Promise.resolve();
    windowTarget.dispatchEvent(new Event('focus'));
    expect(checkPending).toHaveBeenCalledTimes(2);

    unregister();
  });
});
