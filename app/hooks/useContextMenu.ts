/**
 * コンテキストメニュー管理カスタムHook
 *
 * 責務:
 * - メニュー構築
 * - タグ管理UI
 * - 色変更、アーカイブ、削除アクション
 *
 * Note: このHookは現時点では基本構造のみ提供します。
 * 完全な実装はStickyNote.tsxのshowContextMenu関数を参考に、
 * 必要に応じて拡張してください。
 */

import { useCallback } from 'react';
import { NoteMeta } from '@/app/api/notes';

export type UseContextMenuOptions = {
    selectedFile: NoteMeta | null;
    isTagDeleteMode: boolean;
    onColorChange: (color: string) => void;
    onArchive: () => Promise<void>;
    onDelete: () => Promise<void>;
    onTagToggle: (tag: string, isChecked: boolean) => Promise<void>;
    allTags: string[];
    currentTags: string[];
    t: (key: string) => string;
};

export type UseContextMenuReturn = {
    showContextMenu: (x?: number, y?: number) => Promise<void>;
};

/**
 * コンテキストメニュー管理Hook
 *
 * このHookは、コンテキストメニューの表示とアクション処理を管理します。
 * 実際のメニュー構築ロジックは、StickyNote.tsxのshowContextMenu関数を
 * 参考にして実装してください。
 */
export function useContextMenu(options: UseContextMenuOptions): UseContextMenuReturn {
    const {
        selectedFile,
        isTagDeleteMode,
        onColorChange,
        onArchive,
        onDelete,
        onTagToggle,
        allTags,
        currentTags,
        t
    } = options;

    /**
     * コンテキストメニューを表示する
     *
     * @param x - X座標（省略時はカーソル位置）
     * @param y - Y座標（省略時はカーソル位置）
     */
    const showContextMenu = useCallback(async (x?: number, y?: number) => {
        if (!selectedFile) return;

        try {
            console.log('[useContextMenu] Showing context menu at:', x, y);

            // TODO: 完全なメニュー構築ロジックを実装
            // 現時点では基本構造のみ
            // StickyNote.tsxの1140行目からのshowContextMenu関数を参考にしてください

            // 実装例:
            // 1. MenuItem/Submenu/PredefinedMenuItemをインポート
            // 2. isTagDeleteModeに応じたメニュー構築
            // 3. menu.popup()で表示

            console.warn('[useContextMenu] Full implementation needed - see StickyNote.tsx line 1140');
        } catch (err) {
            console.error('[useContextMenu] Failed to show context menu:', err);
        }
    }, [
        selectedFile,
        isTagDeleteMode,
        onColorChange,
        onArchive,
        onDelete,
        onTagToggle,
        allTags,
        currentTags,
        t
    ]);

    return { showContextMenu };
}
