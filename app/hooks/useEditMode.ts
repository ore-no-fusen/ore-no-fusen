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
    initialIsEditing?: boolean; // 新規ノート等で最初から編集モードで開始する場合
};

export type UseEditModeReturn = {
    isEditing: boolean;
    editBody: string;
    cursorPosition: number | null;
    initialCoords: { x: number, y: number } | null;

    startEditing: (cursorPos?: number, coords?: { x: number, y: number }) => void;
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
    isCapturing = false,
    initialIsEditing = false,
}: UseEditModeOptions): UseEditModeReturn {
    const [isEditing, setIsEditing] = useState(initialIsEditing);
    const [editBody, setEditBody] = useState(initialContent);
    const [cursorPosition, setCursorPosition] = useState<number | null>(null);
    const [initialCoords, setInitialCoords] = useState<{ x: number, y: number } | null>(null);

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
    const startEditing = useCallback((cursorPos?: number, coords?: { x: number, y: number }) => {
        if (isEditing) {
            return;
        }

        const gracePeriod = 200;
        ignoreBlurUntilRef.current = Date.now() + gracePeriod;
        setIsEditing(true);
        // [修正] 以前は下部クリック空間確保のために \n を15行追加していましたが、
        // 座標ベースのカーソル移動 (posAtCoords) を導入したため不要となりました。
        setEditBody(initialContent);
        setCursorPosition(cursorPos ?? null);
        setInitialCoords(coords ?? null);
    }, [isEditing, initialContent]);

    /**
     * 編集モードを終了する（保存を実行）
     */
    const endEditing = useCallback(async () => {
        if (isCommittingRef.current) {
            return;
        }

        if (isCapturing) {
            return;
        }

        isCommittingRef.current = true;

        try {
            // [修正] Padding Line仕様を廃止したため、ユーザーの入力した末尾改行を意図的に維持する
            const currentBody = editBodyRef.current;
            await onSave(currentBody, rawFrontmatter, true);
        } catch (e) {
            console.error('[useEditMode] Save failed (editing will still end):', e);
        } finally {
            // 保存成功・失敗に関わらず、編集モードを必ず終了する
            setIsEditing(false);
            lastEditEndedAt.current = Date.now();
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
        initialCoords,
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
