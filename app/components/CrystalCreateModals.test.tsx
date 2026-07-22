import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import QaCreateModal from './QaCreateModal';
import TermCreateModal from './TermCreateModal';

vi.mock('@/app/api/recipes', () => ({
    createQaNote: vi.fn(),
    createTermNote: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn() }));

vi.mock('@/lib/settings-store', () => ({
    useSettings: () => ({ settings: { language: 'ja' }, loading: false }),
}));

vi.mock('@/app/utils/crystalFormatConfig', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/app/utils/crystalFormatConfig')>();
    return {
        ...actual,
        loadCrystalFormats: vi.fn().mockResolvedValue({
            version: 1,
            recipe: actual.DEFAULT_CRYSTAL_FORMATS.recipe,
            qa: {
                sections: [
                    { label: 'Question', slot: 'question', tracked: true },
                    { label: 'Answer', slot: 'answer', tracked: true },
                    { label: 'Source', slot: 'source', tracked: true },
                    { label: 'Evidence and Notes', slot: 'supplement', tracked: true },
                    { label: 'Improvement History', slot: 'history', tracked: false },
                ],
            },
            term: {
                sections: [
                    { label: 'Term', slot: 'name', tracked: true },
                    { label: 'In One Line', slot: 'gist', tracked: true },
                    { label: 'Original / Translation', slot: 'free', tracked: true },
                    { label: 'Meaning', slot: 'detail', tracked: true },
                    { label: 'Related Terms', slot: 'free', tracked: true },
                    { label: 'Source', slot: 'source', tracked: true },
                    { label: 'Notes', slot: 'supplement', tracked: true },
                    { label: 'Improvement History', slot: 'history', tracked: false },
                ],
            },
        }),
    };
});

afterEach(() => cleanup());

describe('crystal create modal localization', () => {
    it('restores stored English Q&A defaults to Japanese', async () => {
        render(<QaCreateModal sourceBody={'質問\n回答'} sourceTags={[]} onClose={vi.fn()} />);
        const draft = await screen.findByLabelText('QAの叩き台') as HTMLTextAreaElement;
        await waitFor(() => expect(draft.value).toContain('# 問い'));
        expect(draft.value).toContain('# 答え');
        expect(draft.value).toContain('# きっかけ');
        expect(draft.value).toContain('# 根拠・補足');
        expect(draft.value).toContain('# 改善履歴');
        expect(draft.value).not.toContain('# Question');
    });

    it('restores stored English Term defaults to Japanese', async () => {
        render(<TermCreateModal sourceBody={'用語\n説明'} sourceTags={[]} onClose={vi.fn()} />);
        const draft = await screen.findByLabelText('用語の叩き台') as HTMLTextAreaElement;
        await waitFor(() => expect(draft.value).toContain('# 用語'));
        expect(draft.value).toContain('# 一言でいうと');
        expect(draft.value).toContain('# 意味');
        expect(draft.value).toContain('# きっかけ');
        expect(draft.value).toContain('# 補足');
        expect(draft.value).toContain('# 改善履歴');
        expect(draft.value).not.toContain('# Term');
    });
});
