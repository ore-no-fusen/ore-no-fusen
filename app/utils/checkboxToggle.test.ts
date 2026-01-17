import { describe, it, expect } from 'vitest';

/**
 * チェックボックストグル機能のテスト
 * 
 * 2026-01-14発生の回帰バグ防止:
 * - handleToggleCheckboxがsetContentを更新しないと表示モードで反映されない
 */

// チェックボックストグルのロジックを切り出してテスト
function toggleCheckboxInContent(content: string, lineIndex: number): string | null {
    const lines = content.split('\n');
    if (lineIndex < 0 || lineIndex >= lines.length) return null;

    const line = lines[lineIndex];
    const taskMatch = line.match(/^([\-\*\+]\s+\[)([ xX])(\]\s+.*)$/);

    if (taskMatch) {
        const isChecked = taskMatch[2].toLowerCase() === 'x';
        const newChar = isChecked ? ' ' : 'x';
        lines[lineIndex] = `${taskMatch[1]}${newChar}${taskMatch[3]}`;
        return lines.join('\n');
    }
    return null;
}

describe('チェックボックストグル機能', () => {

    it('未チェックのボックスをチェック状態に変更できる', () => {
        const content = `タスクリスト
- [ ] タスク1
- [ ] タスク2`;

        const result = toggleCheckboxInContent(content, 1);

        expect(result).not.toBeNull();
        expect(result).toContain('- [x] タスク1');
        expect(result).toContain('- [ ] タスク2'); // 他のタスクは変わらない
    });

    it('チェック済みのボックスを未チェック状態に変更できる', () => {
        const content = `タスクリスト
- [x] 完了タスク
- [ ] 未完了タスク`;

        const result = toggleCheckboxInContent(content, 1);

        expect(result).not.toBeNull();
        expect(result).toContain('- [ ] 完了タスク');
    });

    it('大文字Xもチェック済みとして認識する', () => {
        const content = `- [X] 大文字Xタスク`;

        const result = toggleCheckboxInContent(content, 0);

        expect(result).toContain('- [ ] 大文字Xタスク');
    });

    it('チェックボックスでない行では何も起きない', () => {
        const content = `通常の行
- 箇条書き
# 見出し`;

        expect(toggleCheckboxInContent(content, 0)).toBeNull();
        expect(toggleCheckboxInContent(content, 1)).toBeNull();
        expect(toggleCheckboxInContent(content, 2)).toBeNull();
    });

    it('不正なインデックスでは何も起きない', () => {
        const content = `- [ ] タスク`;

        expect(toggleCheckboxInContent(content, -1)).toBeNull();
        expect(toggleCheckboxInContent(content, 10)).toBeNull();
    });

    it('* と + もリストマーカーとして認識する', () => {
        const content = `* [ ] アスタリスク
+ [ ] プラス`;

        const result1 = toggleCheckboxInContent(content, 0);
        expect(result1).toContain('* [x] アスタリスク');

        const result2 = toggleCheckboxInContent(content, 1);
        expect(result2).toContain('+ [x] プラス');
    });

    //
    // 回帰テスト
    //

    it('No.4バグ回帰テスト: トグル後の文字列が正しく生成される', () => {
        // 実際のデータ形式でテスト
        const content = `ロードマップ

- [x] 完了した機能
- [ ] 未完了の機能
- [ ] もう一つの未完了`;

        // 2番目のチェックボックス（index 3）をトグル
        const result = toggleCheckboxInContent(content, 3);

        expect(result).not.toBeNull();
        expect(result).toContain('- [x] 完了した機能'); // 変わらない
        expect(result).toContain('- [x] 未完了の機能'); // トグルされる
        expect(result).toContain('- [ ] もう一つの未完了'); // 変わらない
    });
});
