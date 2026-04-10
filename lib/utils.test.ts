import { describe, it, expect } from 'vitest';
import { extractTitleBody } from './utils';

describe('extractTitleBody', () => {
  it('1行目をタイトルとして分離する', () => {
    const input = 'テストタイトル\n本文1行目\n本文2行目';
    const result = extractTitleBody(input);
    expect(result.title).toBe('テストタイトル');
    expect(result.body).toBe('本文1行目\n本文2行目');
  });

  it('# プレフィックスを削除する', () => {
    const input = '# 見出し1\n本文';
    const result = extractTitleBody(input);
    expect(result.title).toBe('見出し1');
    expect(result.body).toBe('本文');
  });

  it('複数行の空行を詰めて本文を返す', () => {
    const input = '# タイトル\n\n\nここから本文';
    const result = extractTitleBody(input);
    expect(result.title).toBe('タイトル');
    expect(result.body).toBe('ここから本文');
  });
});
