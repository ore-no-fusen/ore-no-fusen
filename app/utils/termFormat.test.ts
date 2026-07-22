import { describe, expect, it } from 'vitest';
import { createImprovementHistoryLine, getChangedCrystalSections, splitCrystalSections } from './crystalFormat';
import { buildTermDraft, splitTermNameAndBody, TERM_SPEC } from './termFormat';

describe('splitTermNameAndBody', () => {
    it('uses the first content line as the term name', () => {
        expect(splitTermNameAndBody('RAG\n検索拡張生成')).toEqual({
            name: 'RAG',
            rest: '検索拡張生成',
        });
    });

    it('flattens a heading used as the term name', () => {
        expect(splitTermNameAndBody('# RAG\n検索拡張生成')).toEqual({
            name: 'RAG',
            rest: '検索拡張生成',
        });
    });

    it('skips leading blank lines before the term name', () => {
        expect(splitTermNameAndBody('\n\nRAG\n検索拡張生成')).toEqual({
            name: 'RAG',
            rest: '\n\n検索拡張生成',
        });
    });

    it('does not use a URL line as the term name and keeps it in the rest', () => {
        expect(splitTermNameAndBody('https://example.com\nRAG\n検索拡張生成')).toEqual({
            name: 'RAG',
            rest: 'https://example.com\n検索拡張生成',
        });
    });

    it('returns empty name and body for empty input', () => {
        expect(splitTermNameAndBody('')).toEqual({
            name: '',
            rest: '',
        });
    });
});

describe('buildTermDraft', () => {
    it('uses the second line as summary and the third line onward as meaning', () => {
        const draft = buildTermDraft({
            sourceTitle: '語彙',
            termName: '  RAG  ',
            sourceBody: `

意味1

意味2

例1

例2
`,
            date: '2026-07-08',
        });

        expect(splitCrystalSections(TERM_SPEC, draft)).toMatchObject({
            用語: 'RAG',
            一言でいうと: '意味1',
            '原語・訳': '',
            意味: '意味2\n\n例1\n\n例2',
            関連ワード: '',
        });
    });

    it('flattens headings and preserves indentation in meaning lines', () => {
        const draft = buildTermDraft({
            sourceTitle: '字下げ',
            sourceBody: '# 見出し\n## 説明\n- 親\n  - 子\n    続き',
            date: '2026-07-08',
        });

        expect(splitCrystalSections(TERM_SPEC, draft)).toMatchObject({
            用語: '',
            一言でいうと: '見出し',
            意味: '説明\n- 親\n  - 子\n    続き',
        });
    });

    it('moves URLs and images to supplement with duplicate references removed', () => {
        const draft = buildTermDraft({
            sourceTitle: '資料',
            sourceBody: `
意味1
https://example.com
意味2
https://example.com
![画面](screen.png)
![画面](screen.png)
例
`,
            date: '2026-07-08',
        });

        expect(splitCrystalSections(TERM_SPEC, draft)).toMatchObject({
            一言でいうと: '意味1',
            意味: '意味2\n例',
            補足: '## 参考\n- https://example.com\n## 画像\n- ![画面](screen.png)',
        });
    });

    it('leaves the trigger empty regardless of the source title', () => {
        const titled = buildTermDraft({
            sourceTitle: '  用語メモ  ',
            termName: '  RAG  ',
            sourceBody: '意味',
            date: '2026-07-08',
        });
        const untitled = buildTermDraft({
            sourceTitle: '   ',
            sourceBody: '意味',
            date: '26-07-08',
        });

        expect(splitCrystalSections(TERM_SPEC, titled).用語).toBe('RAG');
        expect(splitCrystalSections(TERM_SPEC, titled).きっかけ).toBe('');
        expect(splitCrystalSections(TERM_SPEC, untitled).用語).toBe('');
        expect(splitCrystalSections(TERM_SPEC, untitled).きっかけ).toBe('');
    });
});

describe('TERM_SPEC', () => {
    it('returns changed sections and creates history lines in document order', () => {
        const original = buildTermDraft({
            sourceTitle: '用語',
            termName: 'RAG',
            sourceBody: '意味\n説明\n例',
            date: '2026-07-08',
        });
        const changed = original
            .replace('RAG', 'GraphRAG')
            .replace('# 一言でいうと\n意味', '# 一言でいうと\n別の意味')
            .replace('# 意味\n説明\n例', '# 意味\n説明\n別の例')
            .replace('- 26-07-08 初版', '- 26-07-08 初版\n- 26-07-09 意味');

        const changedSections = getChangedCrystalSections(TERM_SPEC, original, changed);

        expect(changedSections).toEqual(['用語', '一言でいうと', '意味']);
        expect(createImprovementHistoryLine(TERM_SPEC, '2026-07-09', ['補足', '意味', '原語・訳', '用語'])).toBe(
            '- 26-07-09 用語・原語・訳・意味・補足',
        );
    });
});
