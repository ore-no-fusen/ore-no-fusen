import { describe, expect, it } from 'vitest';
import { createImprovementHistoryLine, getChangedCrystalSections, splitCrystalSections } from './crystalFormat';
import { buildQaDraft, QA_SPEC } from './qaFormat';

describe('buildQaDraft', () => {
    it('builds a draft with source title in question and trigger', () => {
        const draft = buildQaDraft({
            sourceTitle: '  なぜQA化するのか  ',
            sourceBody: '本文',
            date: '2026-07-08',
        });

        expect(splitCrystalSections(QA_SPEC, draft)).toMatchObject({
            問い: 'なぜQA化するのか',
            答え: '本文',
            きっかけ: '- 26-07-08 付箋『なぜQA化するのか』から作成',
            改善履歴: '- 26-07-08 初版',
        });
    });

    it('leaves question empty and omits title from trigger when source title is missing', () => {
        const draft = buildQaDraft({
            sourceTitle: '   ',
            sourceBody: '本文',
            date: '26-07-08',
        });

        expect(splitCrystalSections(QA_SPEC, draft)).toMatchObject({
            問い: '',
            答え: '本文',
            きっかけ: '- 26-07-08 付箋から作成',
        });
    });

    it('flattens headings, moves URLs and images to supplement, and preserves body blank lines', () => {
        const draft = buildQaDraft({
            sourceTitle: '資料',
            sourceBody: `
# 見出し

本文1
https://example.com
https://example.com
![画面](screen.png)
![画面](screen.png)

## 小見出し
本文2
`,
            date: '2026-07-08',
        });

        expect(splitCrystalSections(QA_SPEC, draft)).toMatchObject({
            答え: '見出し\n\n本文1\n\n小見出し\n本文2',
            '根拠・補足': '## 参考\n\n- https://example.com\n\n## 画像\n\n- ![画面](screen.png)',
        });
    });

    it('preserves leading spaces on non-heading answer lines', () => {
        const draft = buildQaDraft({
            sourceTitle: '字下げ',
            sourceBody: '# 見出し\n- 親\n  - 子\n    続き',
            date: '2026-07-08',
        });

        expect(splitCrystalSections(QA_SPEC, draft).答え).toBe('見出し\n- 親\n  - 子\n    続き');
    });
});

describe('QA_SPEC', () => {
    it('returns changed sections and creates history lines in document order', () => {
        const original = buildQaDraft({
            sourceTitle: '問い',
            sourceBody: '答え',
            date: '2026-07-08',
        });
        const changed = original
            .replace('問い', '別の問い')
            .replace('答え', '別の答え')
            .replace('- 26-07-08 初版', '- 26-07-08 初版\n- 26-07-09 答え');

        const changedSections = getChangedCrystalSections(QA_SPEC, original, changed);

        expect(changedSections).toEqual(['問い', '答え']);
        expect(createImprovementHistoryLine(QA_SPEC, '2026-07-09', ['根拠・補足', '問い'])).toBe(
            '- 26-07-09 問い・根拠・補足',
        );
    });
});
