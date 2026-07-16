import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RecipeCreateModal from './RecipeCreateModal';

const getRecipeCandidates = vi.fn();

vi.mock('@/app/api/recipes', () => ({
    createRecipeNote: vi.fn(),
    getRecipeCandidates: (...args: unknown[]) => getRecipeCandidates(...args),
}));

vi.mock('@/app/api/notes', () => ({
    readNote: vi.fn(),
}));

vi.mock('@/app/utils/crystalFormatConfig', () => ({
    loadCrystalFormats: vi.fn().mockResolvedValue({
        recipe: {
            sections: [
                { label: 'こんなとき', slot: 'situation', tracked: true },
                { label: 'どうする', slot: 'steps', tracked: true },
                { label: 'きっかけ', slot: 'source', tracked: true },
                { label: '補足', slot: 'supplement', tracked: true },
                { label: '改善履歴', slot: 'history', tracked: false },
            ],
        },
    }),
}));

vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn() }));

describe('RecipeCreateModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getRecipeCandidates.mockResolvedValue({
            yellows: [{ path: 'yellow.md', title: '黄色の経験', preview: 'あのとき' }],
            pinks: [{ path: 'pink.md', title: '桃色の提案', preview: '追加手順' }],
        });
    });

    it('黄色だけを候補表示し、きっかけに入ることを明記する', async () => {
        render(
            <RecipeCreateModal
                sourcePath="blue.md"
                sourceBody={'実装するとき\n確認する'}
                sourceTags={['開発']}
                onClose={vi.fn()}
            />,
        );

        expect(await screen.findByText('黄色（0〜1件）— 選ぶと「きっかけ」に入ります')).not.toBeNull();
        expect(screen.getByText('黄色の経験')).not.toBeNull();
        await waitFor(() => expect(screen.queryByText('桃色の提案')).toBeNull());
    });
});
