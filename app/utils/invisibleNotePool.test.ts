import { describe, expect, it } from 'vitest';
import { selectReadyInvisibleNote, shouldEditPromotedPoolNote } from './invisibleNotePool';

describe('初回用の見えない付箋', () => {
    it('準備済みかつ未使用のPool窓だけを選ぶ', () => {
        const windows = [
            { label: 'main' },
            { label: 'pool-window-not-ready' },
            { label: 'pool-window-used' },
            { label: 'pool-window-persisted' },
            { label: 'pool-window-ready' },
        ];
        const selected = selectReadyInvisibleNote(
            windows,
            new Set(['pool-window-used', 'pool-window-persisted', 'pool-window-ready']),
            new Set(['pool-window-used']),
            (label) => label === 'pool-window-persisted',
        );
        expect(selected?.label).toBe('pool-window-ready');
    });

    it('利用できる見えない付箋がなければ通常生成へフォールバックできる', () => {
        const selected = selectReadyInvisibleNote(
            [{ label: 'pool-window-not-ready' }],
            new Set(),
            new Set(),
            () => false,
        );
        expect(selected).toBeUndefined();
    });
});

describe('Pool昇格後の表示モード', () => {
    it('新規付箋は従来どおり編集モードで開く', () => {
        expect(shouldEditPromotedPoolNote(true)).toBe(true);
    });

    it('クイックランチャーから開く既存結晶は表示モードで開く', () => {
        expect(shouldEditPromotedPoolNote(false)).toBe(false);
        expect(shouldEditPromotedPoolNote(undefined)).toBe(false);
    });
});
