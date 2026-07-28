import { describe, expect, it } from 'vitest';
import { getDefaultNotificationTitle, resolvePushTitles } from './notification-title';

describe('getDefaultNotificationTitle', () => {
  it('日本語環境では「俺の付箋」を返す', () => {
    expect(getDefaultNotificationTitle('ja-JP')).toBe('俺の付箋');
  });

  it('英語環境では「FUSEN」を返す', () => {
    expect(getDefaultNotificationTitle('en-US')).toBe('FUSEN');
  });
});

describe('resolvePushTitles', () => {
  it('空タイトルでは日本語の通知名だけを補い、保存タイトルは空のままにする', () => {
    expect(resolvePushTitles('', 'ja-JP')).toEqual({
      noteTitle: '',
      notificationTitle: '俺の付箋',
    });
  });

  it('空タイトルでは英語の通知名だけを補い、保存タイトルは空のままにする', () => {
    expect(resolvePushTitles('', 'en-US')).toEqual({
      noteTitle: '',
      notificationTitle: 'FUSEN',
    });
  });

  it('元のタイトルがある場合は通知と保存の両方で保持する', () => {
    expect(resolvePushTitles('買い物', 'en-US')).toEqual({
      noteTitle: '買い物',
      notificationTitle: '買い物',
    });
  });
});
