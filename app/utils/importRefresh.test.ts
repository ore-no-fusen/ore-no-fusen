import { describe, expect, it, vi } from 'vitest';
import { refreshImportedNotes } from './importRefresh';

describe('refreshImportedNotes', () => {
    it('一覧同期後に取り込んだ付箋をすべて表示し直す', async () => {
        const emitEvent = vi.fn().mockResolvedValue(undefined);

        await refreshImportedNotes(
            { imported_paths: ['C:\\notes\\one.md', 'C:\\notes\\two.md'] },
            emitEvent,
        );

        expect(emitEvent.mock.calls).toEqual([
            ['fusen:notes_updated'],
            ['fusen:open_imported_notes', {
                paths: ['C:\\notes\\one.md', 'C:\\notes\\two.md'],
            }],
        ]);
    });
});
