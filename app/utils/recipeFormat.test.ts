import { describe, expect, it } from 'vitest';
import {
    appendImprovementHistoryLine,
    buildRecipeDraft,
    createImprovementHistoryLine,
    getChangedRecipeSections,
    joinRecipeSections,
    splitRecipeSections,
    truncateRecipeName,
} from './recipeFormat';
import { getCrystalNameFromSection } from './crystalFormat';

const SAMPLE_RECIPE = `# こんなとき

AI開発で新しい機能を作る時

# どうする

1. 要件を出す
2. 方針を決める

# 補足

## 参考

- https://example.com

# 改善履歴

- 26-07-05 初版`;

describe('splitRecipeSections', () => {
    it('splits the five recipe sections', () => {
        expect(splitRecipeSections(SAMPLE_RECIPE)).toEqual({
            こんなとき: 'AI開発で新しい機能を作る時',
            どうする: '1. 要件を出す\n2. 方針を決める',
            きっかけ: '',
            補足: '## 参考\n\n- https://example.com',
            改善履歴: '- 26-07-05 初版',
        });
    });

    it('returns empty sections for empty body and missing sections', () => {
        expect(splitRecipeSections('')).toEqual({
            こんなとき: '',
            どうする: '',
            きっかけ: '',
            補足: '',
            改善履歴: '',
        });
        expect(splitRecipeSections('# どうする\n\n1. 動く')).toMatchObject({
            こんなとき: '',
            どうする: '1. 動く',
            きっかけ: '',
            補足: '',
            改善履歴: '',
        });
    });

    it('joins recipe sections back into the fixed format', () => {
        const joined = joinRecipeSections({
            こんなとき: '困った時',
            どうする: '1. 動く',
            きっかけ: '',
            補足: '## 参考',
            改善履歴: '- 26-07-05 初版',
        });

        expect(joined).toBe(`# こんなとき
困った時
# どうする
1. 動く
# きっかけ

# 補足
## 参考
# 改善履歴
- 26-07-05 初版`);
    });
});

describe('getChangedRecipeSections', () => {
    it('returns changed sections in document order', () => {
        const changed = SAMPLE_RECIPE
            .replace('AI開発で新しい機能を作る時', '困った時')
            .replace('## 参考', '## メモ');

        expect(getChangedRecipeSections(SAMPLE_RECIPE, changed)).toEqual(['こんなとき', '補足']);
    });

    it('ignores changes in the improvement history section', () => {
        const changed = `${SAMPLE_RECIPE}\n- 26-07-06 どうする`;

        expect(getChangedRecipeSections(SAMPLE_RECIPE, changed)).toEqual([]);
    });
});

describe('improvement history', () => {
    it('creates a history line with YY-MM-DD date and section names', () => {
        expect(createImprovementHistoryLine('2026-07-12', ['どうする', 'こんなとき'])).toBe(
            '- 26-07-12 こんなとき・どうする',
        );
    });

    it('appends a line to the end of the improvement history section', () => {
        const appended = appendImprovementHistoryLine(SAMPLE_RECIPE, '- 26-07-12 どうする');

        expect(splitRecipeSections(appended).改善履歴).toBe('- 26-07-05 初版\n- 26-07-12 どうする');
    });

    it('creates the improvement history section when it is missing', () => {
        const appended = appendImprovementHistoryLine('# こんなとき\n\n困った時', '- 26-07-12 こんなとき');

        expect(appended).toContain('# 改善履歴\n- 26-07-12 こんなとき');
    });
});

describe('buildRecipeDraft', () => {
    it('uses the first situation line as the shared name', () => {
        const spec = {
            sectionNames: ['こんなとき', 'どうする', 'きっかけ', '補足', '改善履歴'],
            trackedSectionNames: ['こんなとき', 'どうする', 'きっかけ', '補足'],
        } as const;
        const draft = buildRecipeDraft({
            blueBody: '設定変更で困ったとき\n確認する',
            yellowBody: '設定変更で困ったとき\n再設定するとき',
            date: '2026-07-15',
        });
        expect(getCrystalNameFromSection(spec, draft, 'こんなとき')).toBe('設定変更で困ったとき');
    });

    it('builds a draft from yellow, pink, and blue notes without frontmatter separators', () => {
        const draft = buildRecipeDraft({
            blueBody: `最初に状況を確認する
https://example.com
![画面](screen.png)
最後にテストする`,
            yellowBody: 'AI開発で詰まった時\n次の一手が必要な時\n3行目は入れない',
            pinkBodies: ['要件を書く\n方針を決める'],
            date: '2026-07-05',
        });

        expect(draft).not.toContain('---');
        expect(splitRecipeSections(draft)).toMatchObject({
            こんなとき: '最初に状況を確認する',
            どうする: '1. 最後にテストする\n2. 要件を書く\n3. 方針を決める',
            きっかけ: 'AI開発で詰まった時\n次の一手が必要な時',
            補足: '## 参考\n- https://example.com\n## 画像\n- ![画面](screen.png)',
            改善履歴: '- 26-07-05 初版',
        });
    });

    it('uses the first blue line as the situation when yellow is missing', () => {
        const draft = buildRecipeDraft({
            blueBody: '青の冒頭\n二行目\n三行目',
            pinkBodies: [],
            date: '26-07-05',
        });

        expect(splitRecipeSections(draft).こんなとき).toBe('青の冒頭');
    });

    it('puts blue lines after the first into steps when yellow is missing', () => {
        const draft = buildRecipeDraft({
            blueBody: '青の冒頭\n二行目\n三行目',
            pinkBodies: [],
            date: '26-07-05',
        });

        expect(splitRecipeSections(draft).どうする).toBe('1. 二行目\n2. 三行目');
    });

    it('limits steps to seven when source has eight or more step lines', () => {
        const draft = buildRecipeDraft({
            blueBody: '青',
            pinkBodies: ['1\n2\n3\n4\n5\n6\n7\n8'],
            date: '2026-07-05',
        });

        expect(splitRecipeSections(draft).どうする.split('\n')).toHaveLength(7);
        expect(splitRecipeSections(draft).どうする).not.toContain('8');
    });

    it('keeps blue lines at the front of steps when yellow exists and pink has eight or more lines', () => {
        const draft = buildRecipeDraft({
            yellowBody: '菴ｿ縺・ｴ髱｢',
            pinkBodies: ['桃1\n桃2\n桃3\n桃4\n桃5\n桃6\n桃7\n桃8'],
            blueBody: '青1\n青2',
            date: '2026-07-05',
        });

        expect(splitRecipeSections(draft)['どうする']).toBe(
            '1. 青2\n2. 桃1\n3. 桃2\n4. 桃3\n5. 桃4\n6. 桃5\n7. 桃6',
        );
    });

    it('moves URL-only pink notes to references and keeps them out of steps', () => {
        const draft = buildRecipeDraft({
            blueBody: '確認が必要なとき\n確認する',
            pinkBodies: ['https://example.com'],
            date: '2026-07-05',
        });
        const sections = splitRecipeSections(draft);

        expect(sections.どうする).toBe('1. 確認する');
        expect(sections.補足).toBe('## 参考\n- https://example.com');
    });

    it('puts blue into steps and neutralizes material headings', () => {
        const draft = buildRecipeDraft({
            blueBody: 'やったこと２６／7\n7/4 手順ランチャ機能の検討かいし',
            pinkBodies: [
                '# Ctrl+P クイックアクセス機能 実装依頼\n\n1. バックログ\n2. **俺の付箋**\n3. [ ] **お気に入り付箋　ランチャ機能**\n4. [ ] 押したら表にまとめる\n5. [x] タグごとに整列\n\n捕捉はどうやって入れるのかな',
            ],
            date: '2026-07-05',
        });
        const sections = splitRecipeSections(draft);

        expect(sections.こんなとき).toBe('やったこと２６／7');
        expect(sections.どうする.split('\n').some((line) => line.startsWith('# '))).toBe(false);
        expect(sections.どうする.startsWith('1. 7/4 手順ランチャ機能の検討かいし')).toBe(true);
        expect(sections.どうする).toContain('Ctrl+P クイックアクセス機能 実装依頼');
    });
});

describe('truncateRecipeName', () => {
    it('truncates names over ten characters with an ellipsis', () => {
        expect(truncateRecipeName('12345678901')).toBe('1234567890…');
    });

    it('does not split surrogate pairs', () => {
        expect(truncateRecipeName('😀😀😀😀😀😀😀😀😀😀😀')).toBe('😀😀😀😀😀😀😀😀😀😀…');
    });
});
