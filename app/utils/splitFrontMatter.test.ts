import { describe, it, expect } from 'vitest';

/**
 * splitFrontMatter: フロントマターと本文を分離するユーティリティ関数
 * 
 * 重要な仕様：
 * 1. フロントマターは先頭の `---` と最初の閉じ `---` で囲まれた部分
 * 2. 閉じ `---` は front に含まれなければならない（これが壊れるとデータ破損）
 * 3. 本文中に `---` があっても、フロントマターとして誤認しない
 */
function splitFrontMatter(src: string) {
    // 先頭の空白やBOMを除去してからチェック
    const trimmedSrc = src.replace(/^\uFEFF/, '').trimStart();
    if (!trimmedSrc.startsWith('---')) return { front: '', body: src };

    // 元の文字列で位置を計算
    const firstFenceIndex = src.indexOf('---');
    if (firstFenceIndex === -1) return { front: '', body: src };

    // Skip the first '---'
    const nextFence = src.indexOf('---', firstFenceIndex + 3);
    if (nextFence === -1) return { front: '', body: src };

    // 閉じ `---` を含むようにする (nextFence + 3)
    const closingFenceEnd = nextFence + 3;
    const front = src.slice(firstFenceIndex, closingFenceEnd);

    // Find the end of '---' and potential trailing newline
    let bodyStart = closingFenceEnd;
    if (src[bodyStart] === '\n') bodyStart += 1;
    else if (src[bodyStart] === '\r' && src[bodyStart + 1] === '\n') bodyStart += 2;

    const body = src.slice(bodyStart).replace(/^\s+/, '');
    return { front, body };
}

describe('splitFrontMatter', () => {
    //
    // ✅ 正常系テスト
    //

    it('標準的なフロントマターを正しく分離する', () => {
        const input = `---
seq: 1
context: test
---

本文です`;
        const { front, body } = splitFrontMatter(input);

        expect(front).toContain('seq: 1');
        expect(front).toContain('context: test');
        expect(front.endsWith('---')).toBe(true);  // ⚠️ 重要: 閉じ---が含まれる
        expect(body).toBe('本文です');
    });

    it('閉じ `---` がフロントマターに含まれる（データ破損防止）', () => {
        const input = `---
seq: 42
---

Body`;
        const { front, body } = splitFrontMatter(input);

        // 閉じ `---` がfrontに含まれていることを確認（No.2バグの再発防止）
        const fenceCount = (front.match(/---/g) || []).length;
        expect(fenceCount).toBe(2);  // 開き + 閉じ = 2つ
        expect(front.startsWith('---')).toBe(true);
        expect(front.endsWith('---')).toBe(true);
    });

    it('本文に `---` があっても誤認しない', () => {
        const input = `---
seq: 1
---

これは本文。
---
区切り線の下も本文。`;
        const { front, body } = splitFrontMatter(input);

        // フロントマターは最初の2つの `---` だけ
        expect(front).toBe(`---
seq: 1
---`);
        expect(body).toContain('これは本文。');
        expect(body).toContain('---');  // 本文中の --- は保持される
        expect(body).toContain('区切り線の下も本文。');
    });

    it('本文に複数の `---` があっても正しく処理する', () => {
        const input = `---
type: sticky
---

---
---
---`;
        const { front, body } = splitFrontMatter(input);

        expect(front).toBe(`---
type: sticky
---`);
        expect(body).toBe(`---
---
---`);
    });

    //
    // ❌ エッジケース（フロントマターなし）
    //

    it('フロントマターがない場合は全体をbodyとして返す', () => {
        const input = `これは単なるテキスト`;
        const { front, body } = splitFrontMatter(input);

        expect(front).toBe('');
        expect(body).toBe('これは単なるテキスト');
    });

    it('フロントマターの開き `---` だけで閉じがない場合', () => {
        const input = `---
seq: 1
本文がそのまま続く`;
        const { front, body } = splitFrontMatter(input);

        // 閉じがないので全体をbodyとして返す（安全策）
        expect(front).toBe('');
        expect(body).toBe(input);
    });

    it('空文字列を処理できる', () => {
        const { front, body } = splitFrontMatter('');
        expect(front).toBe('');
        expect(body).toBe('');
    });

    //
    // 🔧 特殊文字・エンコーディング
    //

    it('BOM付きファイルを正しく処理', () => {
        const input = `\uFEFF---
seq: 1
---

本文`;
        const { front, body } = splitFrontMatter(input);

        expect(front).toContain('seq: 1');
        expect(front.endsWith('---')).toBe(true);
        expect(body).toBe('本文');
    });

    it('日本語を含むフロントマター', () => {
        const input = `---
context: 日本語のコンテキスト
tags: [タグ1, タグ2]
---

本文は日本語です。`;
        const { front, body } = splitFrontMatter(input);

        expect(front).toContain('日本語のコンテキスト');
        expect(front).toContain('タグ1');
        expect(body).toBe('本文は日本語です。');
    });

    //
    // 🔴 回帰テスト（過去のバグ）
    //

    it('No.2バグ回帰テスト: 閉じ `---` が欠落しない', () => {
        // このテストが失敗したら、No.2バグが再発している
        const input = `---
seq: 28
context:
created: 2026-01-14
updated: 2026-01-14
backgroundColor: #ffcdd2
x: 1425
y: 551
width: 413
height: 241
---

ロードマップ

- 個別機能の実装確認`;
        const { front, body } = splitFrontMatter(input);

        // 最も重要なアサーション: 閉じ `---` が含まれている
        expect(front.endsWith('---')).toBe(true);

        // フロントマターの内容が正しい
        expect(front).toContain('seq: 28');
        expect(front).toContain('height: 241');

        // bodyが正しい
        expect(body).toContain('ロードマップ');
    });
});

/**
 * 再読み込み機能で使われるロジックのテスト
 * - フロントマターからbackgroundColorを抽出
 */
describe('再読み込み機能（loadFileContent）', () => {

    function extractBackgroundColor(frontmatter: string): string {
        const colorMatch = frontmatter.match(/backgroundColor:\s*["']?([^"'\s]+)["']?/);
        return colorMatch ? colorMatch[1] : '#f7e9b0';
    }

    it('backgroundColorを正しく抽出できる', () => {
        const front = `---
seq: 1
backgroundColor: #ffcdd2
---`;
        expect(extractBackgroundColor(front)).toBe('#ffcdd2');
    });

    it('クォート付きのbackgroundColorを抽出できる', () => {
        const front = `backgroundColor: "#e8f5e9"`;
        expect(extractBackgroundColor(front)).toBe('#e8f5e9');
    });

    it('backgroundColorがない場合はデフォルト値を返す', () => {
        const front = `---
seq: 1
---`;
        expect(extractBackgroundColor(front)).toBe('#f7e9b0');
    });

    it('空文字列ではデフォルト値を返す', () => {
        expect(extractBackgroundColor('')).toBe('#f7e9b0');
    });
});
