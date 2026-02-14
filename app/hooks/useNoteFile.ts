/**
 * ノートファイルのCRUD操作を管理するカスタムHook
 *
 * 責務:
 * - ファイル読み込み
 * - 自動保存（800msデバウンス）
 * - フロントマター管理
 * - リネーム検知
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { readNote, saveNote, NoteMeta, Note } from '@/app/api/notes';
import { splitFrontMatter, updateFrontmatterValue } from '@/app/utils/splitFrontMatter';
import { pathsEqual } from '@/app/utils/pathUtils';

export type UseNoteFileOptions = {
    path: string | null;
    isNew: boolean;
    onPathChange?: (newPath: string) => void;
};

export type UseNoteFileReturn = {
    note: Note | null;
    content: string;
    rawFrontmatter: string;
    loading: boolean;
    savePending: boolean;

    loadNote: () => Promise<string>;
    saveNoteContent: (body: string, frontmatter: string, allowRename: boolean) => Promise<void>;
    updateFrontmatter: (key: string, value: any) => void;
    setSavePending: (pending: boolean) => void;
    setContent: (content: string) => void;
    setRawFrontmatter: React.Dispatch<React.SetStateAction<string>>;
};

export function useNoteFile({ path, isNew, onPathChange }: UseNoteFileOptions): UseNoteFileReturn {
    const [note, setNote] = useState<Note | null>(null);
    const [content, setContent] = useState<string>('');
    const [rawFrontmatter, setRawFrontmatter] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [savePending, setSavePending] = useState(false);

    const isRenamingRef = useRef(false);

    /**
     * ノートファイルを読み込む
     */
    const loadNote = useCallback(async (): Promise<string> => {
        if (!path) return '';

        // リネームによるURL更新の場合は、再読み込みをスキップ
        if (isRenamingRef.current) {
            console.log('[useNoteFile] Skipping reload due to rename:', path);
            isRenamingRef.current = false;
            return content;
        }

        setLoading(true);
        try {
            const loadedNote = await readNote(path);
            const { front, body } = splitFrontMatter(loadedNote.body);

            setNote(loadedNote);
            setRawFrontmatter(front);
            setContent(body);

            console.log('[useNoteFile] Note loaded:', path);
            return body;
        } catch (error) {
            console.error('[useNoteFile] Failed to load note:', error);
            // [DEBUG] Show error in content to diagnose "Empty Note" issue
            setContent(`Error loading note:\n${String(error)}\nPath: ${path}`);
            return '';
        } finally {
            setLoading(false);
        }
    }, [path, content]);

    /**
     * ノートを保存する（リネーム対応）
     */
    const saveNoteContent = useCallback(async (
        body: string,
        frontmatter: string,
        allowRename: boolean
    ) => {
        if (!path) return;

        // [Safe Guard] Prevent saving empty content if the note hasn't been loaded yet.
        // This protects against race conditions where save is triggered before load completes.
        if (body.trim() === '' && note === null && !isNew) {
            const msg = '[useNoteFile] BLOCKED: Attempted to save empty content before note was loaded.';
            console.error(msg);
            throw new Error(msg);
        }

        try {
            console.log('[useNoteFile] Saving note:', {
                path,
                bodyLength: body.length,
                allowRename,
                firstLine: body.split('\n')[0]
            });

            const newPath = await saveNote(path, body, frontmatter, allowRename);

            // パスが変更された場合（リネーム）
            if (!pathsEqual(newPath, path)) {
                console.log('[useNoteFile] File renamed:', path, '->', newPath);
                isRenamingRef.current = true;

                if (onPathChange) {
                    onPathChange(newPath);
                }
            }

            setContent(body);
            console.log('[useNoteFile] Note saved successfully');
        } catch (e) {
            console.error('[useNoteFile] Failed to save note:', e);
            throw e;
        }
    }, [path, onPathChange, note, isNew]);

    /**
     * フロントマターの値を更新する
     */
    const updateFrontmatter = useCallback((key: string, value: any) => {
        setRawFrontmatter(prev => updateFrontmatterValue(prev, key, value));
        setSavePending(true);
    }, []);

    /**
     * 自動保存ロジック（800msデバウンス）
     */
    useEffect(() => {
        if (!path || !savePending || !content) return;

        const timer = setTimeout(async () => {
            try {
                console.log('[useNoteFile] Auto-save triggered');
                await saveNoteContent(content, rawFrontmatter, false);
                setSavePending(false);
            } catch (e) {
                console.error('[useNoteFile] Auto-save failed:', e);
            }
        }, 800);

        return () => clearTimeout(timer);
    }, [path, savePending, content, rawFrontmatter, saveNoteContent]);

    return {
        note,
        content,
        rawFrontmatter,
        loading,
        savePending,
        loadNote,
        saveNoteContent,
        updateFrontmatter,
        setSavePending,
        setContent,
        setRawFrontmatter
    };
}
