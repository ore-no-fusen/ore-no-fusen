/** viewerの送信・履歴・日時ユーティリティの試験。表示は実際の画面で試験する。 */
import { describe, it, expect } from 'vitest';
import { insertAtCursor, formatRelativeTime } from './utils';

describe('SEND-03: 画像添付', () => {
  it('insertAtCursor がカーソル位置に文字列を挿入して新しい value を返す', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'hello world';
    textarea.selectionStart = 5;
    textarea.selectionEnd = 5;

    const result = insertAtCursor(textarea, '![](data:image/jpeg;base64,abc)');
    expect(result).toBe('hello![](data:image/jpeg;base64,abc) world');
  });
});

describe('SEND-04: Mermaid挿入', () => {
  it('insertAtCursor が ```mermaid ブロックを正しく挿入できる', () => {
    const textarea = document.createElement('textarea');
    textarea.value = '前のテキスト';
    textarea.selectionStart = 4;
    textarea.selectionEnd = 4;
    const block = '```mermaid\ngraph TD\n  A-->B\n```';
    const result = insertAtCursor(textarea, block);
    expect(result).toContain('```mermaid');
    expect(result).toContain('graph TD');
  });
});

describe('formatRelativeTime', () => {
  it('1時間前の ISO 文字列を「1時間前」として返す', () => {
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const result = formatRelativeTime(oneHourAgo);
    expect(result).toContain('時間前');
  });

  it('2日前の ISO 文字列を「2日前」として返す', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const result = formatRelativeTime(twoDaysAgo);
    expect(result).toContain('日前');
  });
});
