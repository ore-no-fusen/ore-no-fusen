import { describe, expect, it, vi } from 'vitest';
import {
    contextMenuTagItemId,
    buildDuplicateRequestPayload,
    filterAssignableTags,
    getAppOperationMenuLabels,
    getOpenFolderRequest,
    getShortcutShelfMenuState,
    releaseDeleteLockWhenMoveIsRejected,
    saveBeforeDuplicate,
} from './useStickyNoteContextMenu';

vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn().mockResolvedValue(undefined),
}));

describe('existing context-menu helpers', () => {
    it('filters reserved tags', () => {
        expect(filterAssignableTags(['project', 'recipe', 'QA', 'shortcut', 'memo'])).toEqual(['project', 'memo']);
    });

    it('creates stable tag ids', () => {
        expect(contextMenuTagItemId('tag', 0)).toBe('ctx_tag_0');
        expect(contextMenuTagItemId('tag_del', 0)).toBe('ctx_tag_del_0');
    });

    it('calculates shortcut shelf state', () => {
        expect(getShortcutShelfMenuState(['project', 'recipe']).visible).toBe(false);
        expect(getShortcutShelfMenuState(['project']).isRegistered).toBe(false);
        expect(getShortcutShelfMenuState(['project', 'SHORTCUT']).isRegistered).toBe(true);
    });

    it('builds open-folder requests', () => {
        expect(getOpenFolderRequest('C:\\notes\\note.md', 'C:\\notes')).toEqual({
            command: 'fusen_open_containing_folder',
            path: 'C:\\notes\\note.md',
        });
        expect(getOpenFolderRequest(undefined, null)).toBeNull();
    });

    it('releases delete lock only after a rejected move', () => {
        const rejected = { current: true };
        expect(releaseDeleteLockWhenMoveIsRejected({ moved: false, path: 'note.md' }, rejected)).toBe(true);
        expect(rejected.current).toBe(false);

        const moved = { current: true };
        expect(releaseDeleteLockWhenMoveIsRejected({ moved: true, path: 'Trash\\note.md' }, moved)).toBe(false);
        expect(moved.current).toBe(true);
    });

    it('formats app-operation shortcuts', () => {
        expect(getAppOperationMenuLabels({
            new_note_trigger: 'shortcut',
            new_note: 'ctrl+n',
            arrange: 'Shift+Control+KeyL',
        }, 'ja').arrange).toBe('タグで整列  Ctrl+Shift+L');
    });
});

describe('saveBeforeDuplicate', () => {
    it('duplicates only after the latest note state has finished saving', async () => {
        const order: string[] = [];
        const save = vi.fn(async () => { order.push('save'); });
        const duplicate = vi.fn(async () => { order.push('duplicate'); });

        await saveBeforeDuplicate(
            () => ({ body: 'latest body', frontmatter: 'outlineCollapsed: [2]' }),
            save,
            duplicate,
        );

        expect(order).toEqual(['save', 'duplicate']);
        expect(save).toHaveBeenCalledWith('latest body', 'outlineCollapsed: [2]');
        expect(duplicate).toHaveBeenCalledWith({ body: 'latest body', frontmatter: 'outlineCollapsed: [2]' });
    });

    it('saves the live alarm and collapsed state snapshot used by the screen', async () => {
        const save = vi.fn(async () => undefined);
        const liveFrontmatter = 'outlineCollapsed: [2]\nalarm_at: "2026-09-01T21:30:00+09:00"\nalarm_sound: true';

        const duplicate = vi.fn(async () => undefined);
        await saveBeforeDuplicate(
            () => ({ body: '京都旅行', frontmatter: liveFrontmatter }),
            save,
            duplicate,
        );

        expect(save).toHaveBeenCalledWith('京都旅行', liveFrontmatter);
        expect(duplicate).toHaveBeenCalledWith({ body: '京都旅行', frontmatter: liveFrontmatter });
    });

    it('does not duplicate when saving the latest note state fails', async () => {
        const failure = new Error('save failed');
        const duplicate = vi.fn(async () => undefined);

        await expect(saveBeforeDuplicate(
            () => ({ body: 'body', frontmatter: 'frontmatter' }),
            async () => { throw failure; },
            duplicate,
        )).rejects.toBe(failure);
        expect(duplicate).not.toHaveBeenCalled();
    });
});

describe('buildDuplicateRequestPayload', () => {
    it('carries the live collapsed state and alarm across the Tauri event boundary', () => {
        const frontmatter = [
            '---',
            'outlineCollapsed: [2, 14]',
            'alarm_at: "2026-09-02T08:00:00+09:00"',
            'alarm_sound: true',
            '---',
        ].join('\n');

        expect(buildDuplicateRequestPayload('0063.md', {
            body: '# 京都旅行の計画',
            frontmatter,
        }, { sourcePhysWidth: 640, sourcePhysHeight: 900 })).toMatchObject({
            path: '0063.md',
            snapshotBody: '# 京都旅行の計画',
            snapshotFrontmatter: frontmatter,
            sourcePhysWidth: 640,
            sourcePhysHeight: 900,
        });
    });
});
