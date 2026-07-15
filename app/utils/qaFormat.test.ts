import { describe, expect, it } from 'vitest';
import {
    createImprovementHistoryLine,
    getCrystalNameFromSection,
    getChangedCrystalSections,
    removeEmptyCrystalSections,
    splitCrystalSections,
} from './crystalFormat';
import { buildQaDraft, QA_SPEC } from './qaFormat';

describe('buildQaDraft', () => {
    it('uses at most the first 20 characters of the key section as the shared name', () => {
        const draft = '# 問い\n12345678901234567890続き\n# 答え\n回答';
        expect(getCrystalNameFromSection(QA_SPEC, draft, '問い')).toBe('12345678901234567890');
    });

    it('uses the first body line for the question and leaves the trigger empty', () => {
        const draft = buildQaDraft({
            sourceTitle: '  なぜQA化するのか  ',
            sourceBody: 'なぜQA化するのか\n本文',
            date: '2026-07-08',
        });

        expect(splitCrystalSections(QA_SPEC, draft)).toMatchObject({
            問い: 'なぜQA化するのか',
            答え: '本文',
            きっかけ: '',
            改善履歴: '- 26-07-08 初版',
        });
    });

    it('uses a one-line body as the question and leaves empty sections blank', () => {
        const draft = buildQaDraft({
            sourceTitle: '   ',
            sourceBody: '本文',
            date: '26-07-08',
        });

        expect(splitCrystalSections(QA_SPEC, draft)).toMatchObject({
            問い: '本文',
            答え: '',
            きっかけ: '',
        });
        expect(draft).toContain('# 答え\n');
        expect(removeEmptyCrystalSections(QA_SPEC, draft)).not.toContain('# 答え');
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
            問い: '見出し',
            答え: '本文1\n\n小見出し\n本文2',
            '根拠・補足': '## 参考\n- https://example.com\n## 画像\n- ![画面](screen.png)',
        });
    });

    it('preserves leading spaces on non-heading answer lines', () => {
        const draft = buildQaDraft({
            sourceTitle: '字下げ',
            sourceBody: '# 見出し\n- 親\n  - 子\n    続き',
            date: '2026-07-08',
        });

        expect(splitCrystalSections(QA_SPEC, draft).答え).toBe('- 親\n  - 子\n    続き');
    });
});

describe('QA_SPEC', () => {
    it('returns changed sections and creates history lines in document order', () => {
        const original = buildQaDraft({
            sourceTitle: '問い',
            sourceBody: '問い\n答え',
            date: '2026-07-08',
        });
        const changed = original
            .replace('# 問い\n問い', '# 問い\n別の問い')
            .replace('# 答え\n答え', '# 答え\n別の答え')
            .replace('- 26-07-08 初版', '- 26-07-08 初版\n- 26-07-09 答え');

        const changedSections = getChangedCrystalSections(QA_SPEC, original, changed);

        expect(changedSections).toEqual(['問い', '答え']);
        expect(createImprovementHistoryLine(QA_SPEC, '2026-07-09', ['根拠・補足', '問い'])).toBe(
            '- 26-07-09 問い・根拠・補足',
        );
    });
});
