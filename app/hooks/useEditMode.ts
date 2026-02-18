/**
 * 編集モードの状態管理カスタムHook
 *
 * 責務:
 * - 編集モードの開始/終了
 * - 編集内容の管理
 * - カーソル位置管理
 * - Blur制御（安全ガード）
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export type UseEditModeOptions = {
    initialContent: string;
    onSave: (body: string, frontmatter: string, allowRename: boolean) => Promise<void>;
    rawFrontmatter: string;
    isCapturing?: boolean;
};

export type UseEditModeReturn = {
    isEditing: boolean;
    editBody: string;
    cursorPosition: number | null;

    startEditing: (cursorPos?: number) => void;
    endEditing: () => Promise<void>;
    updateEditBody: (newBody: string) => void;
    setIsEditing: (editing: boolean) => void;
    setEditBody: (body: string) => void;

    // Refs for external access
    editBodyRef: React.MutableRefObject<string>;
    isCommittingRef: React.MutableRefObject<boolean>;
    ignoreBlurUntilRef: React.MutableRefObject<number>;
    isCapturingRef?: React.MutableRefObject<boolean>;
    lastEditEndedAt: React.MutableRefObject<number>;
};

export function useEditMode({
    initialContent,
    onSave,
    rawFrontmatter,
    isCapturing = false
}: UseEditModeOptions): UseEditModeReturn {
    const [isEditing, setIsEditing] = useState(false);
    const [editBody, setEditBody] = useState(initialContent);
    const [cursorPosition, setCursorPosition] = useState<number | null>(null);

    const editBodyRef = useRef(editBody);
    const isCommittingRef = useRef(false);
    const ignoreBlurUntilRef = useRef(0);
    const lastEditEndedAt = useRef(0);

    // Sync ref with state
    useEffect(() => {
        editBodyRef.current = editBody;
    }, [editBody]);

    // Sync initial content
    useEffect(() => {
        if (!isEditing) {
            setEditBody(initialContent);
        }
    }, [initialContent, isEditing]);

    /**
     * 編集モードを開始する
     */
    /**
     * 編集モードを開始する
     */
    const startEditing = useCallback((cursorPos?: number) => {
        console.log('[useEditMode] startEditing called. Current isEditing:', isEditing, 'New POS:', cursorPos);
        if (isEditing) {
            console.log('[useEditMode] Already editing, ignoring startEditing');
            return;
        }

        console.log('[useEditMode] Starting edit mode (Setting ignoreBlur for 800ms)');
        ignoreBlurUntilRef.current = Date.now() + 800;
        setIsEditing(true);
        setEditBody(initialContent);
        setCursorPosition(cursorPos ?? null);
    }, [isEditing, initialContent]);

    /**
     * 編集モードを終了する（保存を実行）
     */
    const endEditing = useCallback(async () => {
        console.log('[useEditMode] endEditing called.');
        if (isCommittingRef.current) {
            console.log('[useEditMode] Already committing, skipping endEditing');
            return;
        }

        if (isCapturing) {
            console.log('[useEditMode] Capturing screen, skipping blur/endEditing');
            return;
        }

        isCommittingRef.current = true;

        console.log('[useEditMode] Ending edit mode, saving changes...');

        try {
            const currentBody = editBodyRef.current;
            await onSave(currentBody, rawFrontmatter, true);

            setIsEditing(false);
            lastEditEndedAt.current = Date.now();

            console.log('[useEditMode] Edit mode ended successfully');
        } catch (e) {
            console.error('[useEditMode] Save failed:', e);
            throw e;
        } finally {
            isCommittingRef.current = false;
        }
    }, [onSave, rawFrontmatter, isCapturing]);

    /**
     * 編集内容を更新する
     */
    const updateEditBody = useCallback((newBody: string) => {
        setEditBody(newBody);
    }, []);

    return {
        isEditing,
        editBody,
        cursorPosition,
        startEditing,
        endEditing,
        updateEditBody,
        setIsEditing,
        setEditBody,
        editBodyRef,
        isCommittingRef,
        ignoreBlurUntilRef,
        lastEditEndedAt
    };
}
