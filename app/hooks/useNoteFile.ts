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
import { invoke } from '@tauri-apps/api/core';
import { readNote, saveNote, Note } from '@/app/api/notes';
import { splitFrontMatter, updateFrontmatterValue } from '@/app/utils/splitFrontMatter';
import { pathsEqual } from '@/app/utils/pathUtils';

export type UseNoteFileOptions = {
    path: string | null;
    isNew: boolean;
    onPathChange?: (newPath: string) => void;
    /** 自動保存が全リトライ失敗したときに呼ばれるコールバック */
    onSaveError?: () => void;
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
    pathRef: React.MutableRefObject<string | null>; // 同期アクセス用（stale closure 対策）
};

export function useNoteFile({ path, isNew, onPathChange, onSaveError }: UseNoteFileOptions): UseNoteFileReturn {

    const [note, setNote] = useState<Note | null>(null);
    const [content, setContent] = useState<string>('');
    const [rawFrontmatter, setRawFrontmatter] = useState<string>('');
    // 既存ノートは最初からロード中扱い（pool window で一瞬空エディタが映るのを防ぐ）
    const [loading, setLoading] = useState<boolean>(!!path && !isNew);
    const [savePending, setSavePending] = useState(false);

    const isRenamingRef = useRef(false);
    // loadNote が content に依存しないように ref で現在値を保持
    const contentRef = useRef(content);
    useEffect(() => { contentRef.current = content; }, [content]);
    // path を ref で保持（stale closure 対策 - setDynamicUrlPath の非同期 setState を回避）
    const pathRef = useRef(path);
    pathRef.current = path; // レンダーごとに同期更新
    // [H-1 Safe Guard] 最初のロード完了前に空ボディで保存することを防ぐ
    // 新規ノートは最初から空で意図的なのでフラグをtrueで初期化する
    const hasLoadedRef = useRef(isNew);
    // プール窓がisNew=trueに昇格した場合に同期（初期値はfalseだったため）
    if (isNew && !hasLoadedRef.current) hasLoadedRef.current = true;

    /**
     * ノートファイルを読み込む
     */
    const loadNote = useCallback(async (): Promise<string> => {
        if (!path) return '';

        // リネームによるURL更新の場合は、再読み込みをスキップ
        if (isRenamingRef.current) {
            isRenamingRef.current = false;
            return contentRef.current; // ref 経由で取得（stale closure 回避）
        }

        console.log('[DBG:loadNote] START path=', path, 'stack=', new Error().stack?.split('\n').slice(1,4).join(' | '));
        setLoading(true);
        try {
            const loadedNote = await readNote(path);
            const { front, body } = splitFrontMatter(loadedNote.body);
            try {
                const { getCurrentWindow } = await import('@tauri-apps/api/window');
                await invoke('fusen_set_opacity', {
                    windowLabel: getCurrentWindow().label,
                    opacity: loadedNote.meta.opacity ?? 1.0,
                });
            } catch (e) {
                console.warn('[useNoteFile] Failed to apply opacity:', e);
            }

            setNote(loadedNote);
            setRawFrontmatter(front);
            setContent(body);
            hasLoadedRef.current = true;

            console.log('[DBG:loadNote] END body=', JSON.stringify(body.slice(0, 50)));
            return body;
        } catch (error) {
            console.error('[useNoteFile] Failed to load note:', error);
            return '';
        } finally {
            setLoading(false);
        }
    }, [path]); // content を依存配列から除去 → loadNote が毎回再生成されなくなる

    /**
     * ノートを保存する（リネーム対応）
     */
    const saveNoteContent = useCallback(async (
        body: string,
        frontmatter: string,
        allowRename: boolean
    ) => {
        // pathRef.current を使う（stale closure 対策: setDynamicUrlPath の非同期 setState を回避）
        const currentPath = pathRef.current;
        if (!currentPath) {
            const msg = '[useNoteFile] BLOCKED: path is null (promote setState not yet processed). Rethrowing to abort endEditing.';
            console.error(msg);
            throw new Error(msg);
        }

        // [Safe Guard H-1] ロード完了前に空ボディで保存しようとした場合はブロック
        // 先頭の設定欄（---で囲まれた部分）が存在していても、
        // ロード前の空ボディ保存はデータ消失を引き起こすため防ぐ
        console.log('[DBG:saveNoteContent] START path=', currentPath.slice(-30), 'body=', JSON.stringify(body.slice(0, 50)), 'fm=', JSON.stringify(frontmatter.slice(0, 30)), 'hasLoaded=', hasLoadedRef.current);

        if (!hasLoadedRef.current && body.trim() === '') {
            const msg = '[useNoteFile] BLOCKED: Attempted to save empty body before first successful load. Possible initialization race condition.';
            console.error(msg);
            throw new Error(msg);
        }

        // [Safe Guard] Prevent saving empty content if the note hasn't been loaded yet.
        // This protects against race conditions where save is triggered before load completes.
        if (body.trim() === '' && !frontmatter) {
            const msg = '[useNoteFile] BLOCKED: Attempted to save empty content and empty frontmatter. This indicates initialization failure.';
            console.error(msg);
            throw new Error(msg);
        }

        try {
            const newPath = await saveNote(currentPath, body, frontmatter, allowRename);

            // パスが変更された場合（リネーム）
            if (!pathsEqual(newPath, currentPath)) {
                isRenamingRef.current = true;

                if (onPathChange) {
                    onPathChange(newPath);
                }
            }

            setContent(body);
            setRawFrontmatter(frontmatter);
            hasLoadedRef.current = true; // 保存成功 = ロード済みとみなす（以降の auto-save を有効化）
            console.log('[DBG:saveNoteContent] END saved ok body=', JSON.stringify(body.slice(0, 50)));
        } catch (e) {
            console.error('[useNoteFile] Failed to save note:', e);
            throw e;
        }
    }, [onPathChange]);

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
        if (!hasLoadedRef.current) return; // ロード完了前の auto-save をブロック

        const MAX_RETRY = 3;
        let cancelled = false;
        const timers: ReturnType<typeof setTimeout>[] = [];

        const attemptSave = async (attempt: number) => {
            if (cancelled) return;
            try {
                await saveNoteContent(content, rawFrontmatter, false);
                if (!cancelled) setSavePending(false);
            } catch (e) {
                if (cancelled) return;
                console.error(`[useNoteFile] Auto-save failed (attempt ${attempt}/${MAX_RETRY}):`, e);
                if (attempt < MAX_RETRY) {
                    const delay = 1000 * Math.pow(2, attempt); // 2s, 4s
                    const t = setTimeout(() => attemptSave(attempt + 1), delay);
                    timers.push(t);
                } else {
                    console.error('[useNoteFile] Auto-save failed after all retries. Data may be lost.');
                    // [FIX] alert() の代わりにコールバックで通知（ブロッキング排除）
                    onSaveError?.();
                }

            }
        };

        const initialTimer = setTimeout(() => attemptSave(1), 800);
        timers.push(initialTimer);

        return () => {
            cancelled = true;
            timers.forEach(clearTimeout);
        };
    }, [path, savePending, content, rawFrontmatter, saveNoteContent, onSaveError]);

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
        setRawFrontmatter,
        pathRef
    };
}
