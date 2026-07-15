import { describe, expect, it } from 'vitest';
import {
    createImprovementHistoryLine,
    type CrystalSpec,
    getChangedCrystalSections,
    joinCrystalSections,
    splitCrystalSections,
} from './crystalFormat';

const QA_SPEC: CrystalSpec = {
    sectionNames: ['問い', '答え', '根拠・補足', '改善履歴'],
    trackedSectionNames: ['問い', '答え', '根拠・補足'],
};

const SAMPLE_QA = `# 問い

なぜ切り出すのか

# 答え

共通化するため

# 根拠・補足

後続機能で再利用する

# 改善履歴

- 26-07-05 初版`;

describe('crystalFormat', () => {
    it('splits sections using the provided spec', () => {
        expect(splitCrystalSections(QA_SPEC, SAMPLE_QA)).toEqual({
            問い: 'なぜ切り出すのか',
            答え: '共通化するため',
            '根拠・補足': '後続機能で再利用する',
            改善履歴: '- 26-07-05 初版',
        });
    });

    it('joins sections using the provided spec order', () => {
        expect(
            joinCrystalSections(QA_SPEC, {
                問い: '何を守るか',
                答え: '挙動',
                '根拠・補足': '公開APIは変えない',
                改善履歴: '- 26-07-05 初版',
            }),
        ).toBe(`# 問い
何を守るか
# 答え
挙動
# 根拠・補足
公開APIは変えない
# 改善履歴
- 26-07-05 初版`);
    });

    it('returns changed tracked sections in spec order and ignores improvement history', () => {
        const changed = SAMPLE_QA
            .replace('共通化するため', '再利用するため')
            .replace('後続機能で再利用する', 'QAと用語で再利用する')
            .replace('- 26-07-05 初版', '- 26-07-05 初版\n- 26-07-06 答え');

        expect(getChangedCrystalSections(QA_SPEC, SAMPLE_QA, changed)).toEqual(['答え', '根拠・補足']);
    });

    it('creates a history line with changed sections ordered by the provided spec', () => {
        expect(createImprovementHistoryLine(QA_SPEC, '2026-07-12', ['根拠・補足', '問い'])).toBe(
            '- 26-07-12 問い・根拠・補足',
        );
    });
});
