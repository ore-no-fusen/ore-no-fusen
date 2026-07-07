/**
 * タグ管理カスタムHook
 *
 * 責務:
 * - タグ一覧取得
 * - タグ追加/削除
 * - グローバルタグ削除
 */

import { useState, useCallback } from 'react';
import { getAllTags, addTag, removeTag, deleteTagGlobally } from '@/app/api/tags';
import { isReservedTag } from '@/app/utils/reservedTags';

export const RESERVED_TAG_ERROR_MESSAGE = 'このタグは予約されています';

export function assertTagCanBeAdded(tag: string): void {
    if (isReservedTag(tag)) {
        throw new Error(RESERVED_TAG_ERROR_MESSAGE);
    }
}

export type UseTagManagerReturn = {
    allTags: string[];
    currentTags: string[];

    loadAllTags: () => Promise<void>;
    addTagToNote: (path: string, tag: string) => Promise<void>;
    removeTagFromNote: (path: string, tag: string) => Promise<void>;
    deleteTagFromAllNotes: (tag: string) => Promise<number>;
    setCurrentTags: (tags: string[]) => void;
    setAllTags: (tags: string[]) => void;
};

export function useTagManager(): UseTagManagerReturn {
    const [allTags, setAllTags] = useState<string[]>([]);
    const [currentTags, setCurrentTags] = useState<string[]>([]);

    /**
     * 全てのタグを読み込む
     */
    const loadAllTags = useCallback(async () => {
        try {
            const tags = await getAllTags();
            setAllTags(tags);
            console.log('[useTagManager] Loaded tags:', tags.length);
        } catch (e) {
            console.error('[useTagManager] Failed to load tags:', e);
        }
    }, []);

    /**
     * ノートにタグを追加する
     */
    const addTagToNote = useCallback(async (path: string, tag: string) => {
        try {
            assertTagCanBeAdded(tag);
            await addTag(path, tag);
            await loadAllTags();
            console.log('[useTagManager] Tag added:', tag);
        } catch (e) {
            console.error('[useTagManager] Failed to add tag:', e);
            throw e;
        }
    }, [loadAllTags]);

    /**
     * ノートからタグを削除する
     */
    const removeTagFromNote = useCallback(async (path: string, tag: string) => {
        try {
            await removeTag(path, tag);
            await loadAllTags();
            console.log('[useTagManager] Tag removed:', tag);
        } catch (e) {
            console.error('[useTagManager] Failed to remove tag:', e);
            throw e;
        }
    }, [loadAllTags]);

    /**
     * タグを全ノートから削除する（グローバル削除）
     */
    const deleteTagFromAllNotes = useCallback(async (tag: string) => {
        try {
            const count = await deleteTagGlobally(tag);
            await loadAllTags();
            console.log('[useTagManager] Tag deleted globally:', tag, 'count:', count);
            return count;
        } catch (e) {
            console.error('[useTagManager] Failed to delete tag globally:', e);
            throw e;
        }
    }, [loadAllTags]);

    return {
        allTags,
        currentTags,
        loadAllTags,
        addTagToNote,
        removeTagFromNote,
        deleteTagFromAllNotes,
        setCurrentTags,
        setAllTags
    };
}
