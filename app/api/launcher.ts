import { invoke } from '@tauri-apps/api/core';

export type LauncherTab = 'shortcut' | 'qa' | 'term' | 'recipe';

export type QuickOpenItem = {
    path: string;
    title: string;
    tags: string[];
    launches: number;
    is_recipe: boolean;
};

export type LauncherState = {
    last_tab?: LauncherTab;
    orders: Record<LauncherTab, string[]>;
};

export async function getLauncherState(): Promise<LauncherState> {
    return await invoke<LauncherState>('fusen_get_launcher_state');
}

export async function setLauncherLastTab(tab: LauncherTab): Promise<void> {
    await invoke('fusen_set_launcher_last_tab', { tab });
}

export async function quickOpenNotes(tab: LauncherTab, query: string): Promise<QuickOpenItem[]> {
    return await invoke<QuickOpenItem[]>('fusen_quick_open_notes', { tab, query });
}

export async function openQuickNote(path: string): Promise<void> {
    await invoke('fusen_open_quick_note', { path });
}

export async function reorderQuickNote(
    tab: LauncherTab,
    path: string,
    direction: 'up' | 'down',
): Promise<void> {
    await invoke('fusen_reorder_quick_note', { tab, path, direction });
}

export async function removeFromShelf(path: string): Promise<void> {
    await invoke('fusen_remove_from_shelf', { path });
}

export async function renameQuickNote(path: string, title: string): Promise<void> {
    await invoke('fusen_rename_quick_note', { path, title });
}
