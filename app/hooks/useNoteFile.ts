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
        if (body.trim() === '' && !frontmatter) {
            const msg = '[useNoteFile] BLOCKED: Attempted to save empty content and empty frontmatter. This indicates initialization failure.';
            console.error(msg);
            throw new Error(msg);
        }

        try {
            const now = new Date();
            const ts = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
            console.log(`[useNoteFile | ${ts}] Saving note:`, {
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
            setRawFrontmatter(frontmatter); // [Fix] Update frontmatter state
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
     * 自動保存ロジック（800msデバウンス、失敗時は最大3回リトライ）
     */
    useEffect(() => {
        if (!path || !savePending || !content) return;

        const MAX_RETRY = 3;
        let cancelled = false;
        const timers: ReturnType<typeof setTimeout>[] = [];

        const attemptSave = async (attempt: number) => {
            if (cancelled) return;
            try {
                const now = new Date();
                const ts = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
                console.log(`[useNoteFile | ${ts}] Auto-save triggered (attempt ${attempt}/${MAX_RETRY})`);
                await saveNoteContent(content, rawFrontmatter, false);
                if (!cancelled) setSavePending(false);
            } catch (e) {
                if (cancelled) return;
                console.error(`[useNoteFile] Auto-save failed (attempt ${attempt}/${MAX_RETRY}):`, e);
                if (attempt < MAX_RETRY) {
                    const delay = 1000 * Math.pow(2, attempt); // 2s, 4s
                    console.warn(`[useNoteFile] Retrying auto-save in ${delay}ms...`);
                    const t = setTimeout(() => attemptSave(attempt + 1), delay);
                    timers.push(t);
                } else {
                    console.error('[useNoteFile] Auto-save failed after all retries. Data may be lost.');
                }
            }
        };

        const initialTimer = setTimeout(() => attemptSave(1), 800);
        timers.push(initialTimer);

        return () => {
            cancelled = true;
            timers.forEach(clearTimeout);
        };
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
