import { describe, expect, it, vi } from 'vitest';
import { buildNotificationTargetUrl, focusViewerOrOpenTarget } from './notification-click';

describe('notification click navigation', () => {
  it('既存PWAには押した通知のIDを送ってからfocusする', async () => {
    const viewer = {
      url: 'https://example.com/viewer',
      postMessage: vi.fn(),
      focus: vi.fn().mockResolvedValue(undefined),
    };
    const openWindow = vi.fn();

    await focusViewerOrOpenTarget({
      clientList: [viewer],
      id: 'note-2',
      origin: 'https://example.com',
      openWindow,
    });

    expect(viewer.postMessage).toHaveBeenCalledWith({ type: 'OPEN_NOTE', id: 'note-2' });
    expect(viewer.focus).toHaveBeenCalledOnce();
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('PWA未起動時は押した通知のIDをURLに入れて開く', async () => {
    const openWindow = vi.fn().mockResolvedValue(undefined);

    await focusViewerOrOpenTarget({
      clientList: [],
      id: 'note / 日本語',
      origin: 'https://example.com',
      openWindow,
    });

    expect(openWindow).toHaveBeenCalledWith(buildNotificationTargetUrl(
      'https://example.com',
      'note / 日本語',
    ));
  });

  it('画面を開けなかった場合は本文を含めずエラー種別をログに残す', async () => {
    const log = vi.fn();
    const error = new TypeError('秘密の本文');

    await expect(focusViewerOrOpenTarget({
      clientList: [],
      id: 'note-3',
      origin: 'https://example.com',
      openWindow: vi.fn().mockRejectedValue(error),
      log,
    })).rejects.toBe(error);

    expect(log).toHaveBeenLastCalledWith(
      '[NAV] event=route_failed id=note-3 error=TypeError',
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('秘密の本文');
  });
});
