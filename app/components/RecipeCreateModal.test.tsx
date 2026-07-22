import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RecipeCreateModal from './RecipeCreateModal';

const getRecipeCandidates = vi.fn();

vi.mock('@/app/api/recipes', () => ({
    createRecipeNote: vi.fn(),
    getRecipeCandidates: (...args: unknown[]) => getRecipeCandidates(...args),
}));

vi.mock('@/app/api/notes', () => ({
    readNote: vi.fn(),
}));

vi.mock('@/app/utils/crystalFormatConfig', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/app/utils/crystalFormatConfig')>();
    return {
        ...actual,
        loadCrystalFormats: vi.fn().mockResolvedValue({
            ...actual.DEFAULT_CRYSTAL_FORMATS,
            recipe: {
                sections: [
                    { label: 'When to Use', slot: 'situation', tracked: true },
                    { label: 'Steps', slot: 'steps', tracked: true },
                    { label: 'Source', slot: 'source', tracked: true },
                    { label: 'Notes', slot: 'supplement', tracked: true },
                    { label: 'Improvement History', slot: 'history', tracked: false },
                ],
            },
        }),
    };
});

vi.mock('@/lib/settings-store', () => ({
    useSettings: () => ({ settings: { language: 'ja' }, loading: false }),
}));

vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn() }));

describe('RecipeCreateModal', () => {
    afterEach(() => cleanup());

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

    it('日本語へ戻した後は保存済み英語既定見出しを日本語へ戻す', async () => {
        render(
            <RecipeCreateModal
                sourcePath="blue.md"
                sourceBody={'実装するとき\n確認する'}
                sourceTags={['開発']}
                onClose={vi.fn()}
            />,
        );

        const draft = await screen.findByLabelText('手順の叩き台') as HTMLTextAreaElement;
        await waitFor(() => expect(draft.value).toContain('# こんなとき'));
        expect(draft.value).toContain('# どうする');
        expect(draft.value).toContain('# きっかけ');
        expect(draft.value).toContain('# 補足');
        expect(draft.value).toContain('# 改善履歴');
        expect(draft.value).not.toContain('# When to Use');
    });
});
