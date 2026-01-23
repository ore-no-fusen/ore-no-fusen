
import { invoke } from '@tauri-apps/api/core';

// 依存関係を注入する型
export interface TrayActionContext {
    getCurrentWindowLabel: () => Promise<string>;
    getBasePath: () => Promise<string | null>;
    createNote: (folderPath: string, context: string) => Promise<{ meta: { path: string } }>;
    openWindow: (path: string, isNew: boolean) => Promise<void>;
    folderPath?: string; // 現在のstate
}

/**
 * Handle "create note" action triggered from the system tray.
 * This function contains logic to ensure only the main window processes the request.
 */
export async function handleCreateNoteFromTray(ctx: TrayActionContext) {
    try {
        // Guard: Only allow execution in main window to prevent Duplicate Window Glitch
        const label = await ctx.getCurrentWindowLabel();
        if (label !== 'main') {
            return;
        }

        console.log('[TrayAction] Main window detected. Proceeding with note creation.');

        let targetFolder = ctx.folderPath;
        if (!targetFolder) {
            targetFolder = await ctx.getBasePath() || undefined; // Convert null to undefined for check
        }

        if (!targetFolder) {
            console.error('[TrayAction] Cannot create note: No folder path available');
            return;
        }

        const context = '新規メモ';
        const newNote = await ctx.createNote(targetFolder, context);
        await ctx.openWindow(newNote.meta.path, true);

    } catch (e) {
        console.error('[TrayAction] Failed to create note:', e);
        throw e; // Test can catch this
    }
}
