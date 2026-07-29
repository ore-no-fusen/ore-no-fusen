import { describe, expect, it } from 'vitest';
import {
  buildNotificationDiagnosticReport,
  formatNavigationLog,
  safeErrorName,
} from './diagnostic-log';

describe('PWA notification diagnostic log', () => {
  it('通知経路の解析に必要な項目を一行で出力する', () => {
    expect(formatNavigationLog('draft_load', {
      source: 'url',
      id: 'note-1',
      attempt: 2,
      result: 'missing',
      elapsed_ms: 250,
    })).toBe(
      '[NAV] event=draft_load source=url id=note-1 attempt=2 result=missing elapsed_ms=250',
    );
  });

  it('例外本文を記録せず種類だけを返す', () => {
    const error = new Error('本文やアクセストークンを含む可能性がある詳細');
    const value = safeErrorName(error);
    expect(value).toBe('Error');
    expect(value).not.toContain(error.message);
  });

  it('コピー対象から本文を含み得る旧ログを除外する', () => {
    const report = buildNotificationDiagnosticReport([
      { t: '2026-07-30T00:00:00+09:00', msg: 'push受信 id=note-1 title=秘密の本文' },
      { t: '2026-07-30T00:00:01+09:00', msg: '[NAV] event=notification_click id=note-1' },
    ], '5.0.0-pwa.6');

    expect(report).toContain('[NAV] event=notification_click id=note-1');
    expect(report).not.toContain('秘密の本文');
  });
});
