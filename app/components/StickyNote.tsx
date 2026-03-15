/**
 * StickyNote - 付箋ウィンドウコンポーネント（リファクタリング版）
 *
 * 責務:
 * - 各Hookとコンポーネントの統合
 * - ユーザーインタラクションの調整
 * - イベントリスナーの管理
 *
 * リファクタリング前: 2,344行
 * リファクタリング後: 約500行（78%削減）
 */

'use client';

import { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import React from 'react';
import { useSearchParams } from 'next/navigation';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

// カスタムHook
import { useNoteFile } from '@/app/hooks/useNoteFile';
import { useEditMode } from '@/app/hooks/useEditMode';
import { useWindowManager } from '@/app/hooks/useWindowManager';
import { useTagManager } from '@/app/hooks/useTagManager';
import { useScreenCapture } from '@/app/hooks/useScreenCapture';
import { useStickyNoteContextMenu } from '@/app/hooks/useStickyNoteContextMenu';
import { useNoteStyles } from '@/app/hooks/useNoteStyles';

// UIコンポーネント
import RichTextEditor, { RichTextEditorRef } from './RichTextEditor';
import ToolbarButtons from './ToolbarButtons';
import FloatingFormatBar from './FloatingFormatBar';
import MarkdownRenderer from './MarkdownRenderer';
import ConfirmDialog from './ConfirmDialog';
import SaveErrorToast from './SaveErrorToast';


// ユーティリティ
import { pathsEqual, getFileName } from '../utils/pathUtils';
import { splitFrontMatter, updateFrontmatterValue, removeFrontmatterKey, updateFrontmatterGeometry } from '../utils/splitFrontMatter';
import { resolvePath } from '../utils/markdownUtils';

// API
import { NoteMeta } from '@/app/api/notes';
import { invoke } from '@tauri-apps/api/core';

// 設定・国際化
import { useSettings } from "@/lib/settings-store";
import { getTranslation, type Language } from "@/lib/i18n";
import ErrorBoundary from './ErrorBoundary';



const StickyNote = memo(function StickyNote() {
    const searchParams = useSearchParams();
    // [NEW] プールモード判定と動的パス
    const isPoolParams = searchParams.get('isPool') === 'true';
    const [dynamicUrlPath, setDynamicUrlPath] = useState<string | null>(searchParams.get('path') || null);
    const [isPool, setIsPool] = useState<boolean>(isPoolParams);
    const isPoolRef = useRef(isPoolParams);
    const [isNewState, setIsNewState] = useState<boolean>(searchParams.get('isNew') === '1');

    const urlPath = dynamicUrlPath;
    const isNew = isNewState;

    const [selectedFile, setSelectedFile] = useState<NoteMeta | null>(null);

    // 設定・i18n
    // 設定・i18n
    const { settings } = useSettings();
    const language = (settings.language as Language) || 'ja';
    const t = useMemo(
        () => getTranslation(language),
        [language]
    );


    const [isNewNote, setIsNewNote] = useState(false);

    // フローティングフォーマットバー
    const [floatBarCoords, setFloatBarCoords] = useState<{ top: number; left: number } | null>(null);

    // UI状態
    const [isHover, setIsHover] = useState(false);
    const [isDraggableArea, setIsDraggableArea] = useState(false);
    const [shellCursor, setShellCursor] = useState('default');

    // タグモーダル
    const [showTagModal, setShowTagModal] = useState(false);
    const [tagInputValue, setTagInputValue] = useState('');
    const [tagToDelete, setTagToDelete] = useState<string | null>(null);

    // 保存失敗トースト
    const [showSaveError, setShowSaveError] = useState(false);


    // Refs
    const editorRef = useRef<RichTextEditorRef>(null);
    const editorHostRef = useRef<HTMLDivElement>(null);
    const shellRef = useRef<HTMLDivElement>(null);
    const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
    const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
    const isCapturingRef = useRef(false);
    const isPromotingRef = useRef(false); // 付箋表示中はフォーカスが外れても編集モードを維持する
    // [FIX] Ctrl+N 連打クラッシュ防止: emit自体を1.2秒スロットルする
    // 1枚目は lastCtrlNRef=0 なので即座に通過、2枚目以降は1.2秒インターバルを強制
    const lastCtrlNRef = useRef<number>(0);

    // ============================================================
    // カスタムHook統合
    // ============================================================

    // ノートファイル管理
    const {
        note,
        content,
        rawFrontmatter,
        loading,
        loadNote,
        saveNoteContent,
        updateFrontmatter,
        setSavePending,
        setContent,
        setRawFrontmatter,
        pathRef: noteFilePathRef
    } = useNoteFile({
        path: urlPath,
        isNew,
        onPathChange: (newPath) => {
            // [ROOT FIX] リネーム後にこのコールバックが呼ばれる。
            // 必ず setDynamicUrlPath を呼んで React の urlPath state を新しいパスに更新する。
            // これを呼ばないと urlPath が古いパスのままになり、
            // リネーム後の自動保存が全部「ファイルが見つからない」エラーになる
            setDynamicUrlPath(newPath);

            const url = new URL(window.location.href);
            url.searchParams.set('path', newPath);
            window.history.replaceState({}, '', url.toString());

            const newContext = content.split('\n')[0].trim();
            setSelectedFile((prev) => (prev ? { ...prev, path: newPath, context: newContext } : null));
        },
        onSaveError: () => setShowSaveError(true),
    });


    // スタイル関連（カスタムフックで一元管理）
    const { noteBackgroundColor, setNoteBackgroundColor, noteFontSize } = useNoteStyles(note);

    // 削除・アーカイブ中の保存防止フラグ
    const isDeletingRef = useRef(false);
    // ウィンドウクローズ処理中フラグ（onCloseRequested 再入防止）
    const isHandlingCloseRef = useRef(false);

    // 保存処理のラッパー（削除中は保存しない）
    const handleSave = useCallback(async (body: string, front: string, allowRename: boolean) => {
        console.log('[DBG:handleSave] body=', JSON.stringify(body.slice(0, 50)), 'isPool=', isPool, 'isNew=', isNew, 'isDeleting=', isDeletingRef.current);
        if (isDeletingRef.current) {
            console.log('[DBG:handleSave] SKIP: isDeleting');
            return;
        }
        if (isPoolRef.current) {
            console.log('[DBG:handleSave] SKIP: isPool');
            return;
        }

        await saveNoteContent(body, front, allowRename);
        if (isNew) {
            setIsNewState(false);
        }
    }, [saveNoteContent, isNew]);

    // 編集モード管理
    const {
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
        lastEditEndedAt,
        initialCoords,
    } = useEditMode({
        initialContent: content,
        onSave: handleSave,
        rawFrontmatter,
        isCapturing: isCapturingRef.current,
        initialIsEditing: isNew || isPool, // 新規ノートまたはプール待機は最初から編集モード
    });

    // ウィンドウ管理
    const [isPinned, setIsPinned] = useState(false); // [New]

    // [FIX] stale closure 防止用 ref群
    // scroll_to_line / reload リスナーはasync setupの間にdepsが変わるとリスナーがリークする。
    // リスナー内ではstateではなくrefを参照することで、常に最新値を取得できる。
    const contentForListenerRef = useRef(content);
    useEffect(() => { contentForListenerRef.current = content; }, [content]);
    const isEditingForListenerRef = useRef(isEditing);
    useEffect(() => { isEditingForListenerRef.current = isEditing; }, [isEditing]);
    const startEditingForListenerRef = useRef(startEditing);
    useEffect(() => { startEditingForListenerRef.current = startEditing; }, [startEditing]);
    const endEditingForListenerRef = useRef(endEditing);
    useEffect(() => { endEditingForListenerRef.current = endEditing; }, [endEditing]);

    // [New] ミニマイズ状態からリサイズ操作により自動展開された場合の処理
    const handleAutoExpand = useCallback(async () => {
        if (!note) return;

        let currentFront = rawFrontmatter;
        let currentBody = content;

        if (!currentFront) {
            const { front, body } = splitFrontMatter(note.body);
            currentFront = front;
            currentBody = body;
        }

        const newFront = updateFrontmatterValue(currentFront, 'folded', 'false');
        await saveNoteContent(currentBody, newFront, false);
    }, [note, rawFrontmatter, content, saveNoteContent]);

    // [New] ミニマイズ時の高さをフォント・見出し状況から動的計算
    const getMinimizedHeight = useCallback(() => {
        const lines = content.split('\n');
        const firstLine = lines.length > 0 ? lines[0] : '';
        const isHeading = firstLine.startsWith('# ');
        // 見出しフォーマットの場合は1.1倍のフォントサイズが使われる
        const fontSizeToUse = isHeading ? noteFontSize * 1.1 : noteFontSize;
        const lineHeight = 1.4;
        const paddingY = 8; // 上下4pxずつ (var(--editor-padding))

        return Math.ceil(fontSizeToUse * lineHeight + paddingY);
    }, [content, noteFontSize]);

    // useCallback 化: 毎レンダーの新参照を防ぎ saveWindowState の不要な再生成を止める
    const handleGeometryChange = useCallback((geom: { x: number; y: number; width: number; height: number }) => {
        if (isDeletingRef.current) return;
        // [FIX] プール状態・新規ノート昇格直後はジオメトリ変更保存をスキップする
        if (isPool) return;
        setRawFrontmatter((prev) => updateFrontmatterGeometry(prev, geom));
        setSavePending(true);
    }, [isPool]); // isDeletingRef は ref（安定）、setters は React 保証の安定参照

    const { isMinimized, toggleMinimize, saveWindowState, setOriginalSize, setIsMinimized } = useWindowManager({
        onGeometryChange: handleGeometryChange,
        onAutoExpand: handleAutoExpand,
        getMinimizedHeight // [New]
    });

    // タグ管理
    const {
        allTags,
        currentTags,
        setCurrentTags,
        loadAllTags,
        addTagToNote,
        removeTagFromNote,
        deleteTagFromAllNotes
    } = useTagManager();

    // 初期ロード時に全タグを取得
    useEffect(() => {
        loadAllTags();
    }, [loadAllTags]);

    // スクリーンキャプチャ
    const { captureScreen } = useScreenCapture({
        currentFilePath: urlPath,
        noteSeq: selectedFile?.seq || 0,
        onInsertMarkdown: (markdown) => {
            if (editorRef.current) {
                editorRef.current.insertText(markdown);
            }
        }
    });

    // タグ・背景情報・その他メタデータの同期 (From Metadata)
    useEffect(() => {
        if (!note?.meta) return;

        // Tags
        if (note.meta.tags) {
            setCurrentTags(note.meta.tags);
        }

        // Pin State
        if (note.meta.always_on_top !== undefined) {
            setIsPinned(note.meta.always_on_top);
        }
    }, [note, setCurrentTags]);

    // 初期ロード時の Folded ハンドリング
    const initialSyncDone = useRef(false);
    useEffect(() => {
        if (!initialSyncDone.current && note?.meta) {
            if (note.meta.folded) {
                if (note.meta.width && note.meta.height) {
                    setOriginalSize(note.meta.width, note.meta.height);
                }
                setIsMinimized(true);
                toggleMinimize(); // Apply minimisation (size change)
            }
            initialSyncDone.current = true;
        }
    }, [note, toggleMinimize, setOriginalSize, setIsMinimized]);

    // ピン留め状態の同期（初期ロード完了時および変更時）
    useEffect(() => {
        if (isPinned !== undefined && isPinned !== null) {
            invoke('fusen_set_always_on_top', { enabled: Boolean(isPinned) })
                .catch(err => {
                    console.error('[StickyNote] Failed to set always-on-top:', err);
                });
        }
    }, [isPinned]);

    /**
     * Pin Toggle Handler
     */
    const handleTogglePin = useCallback(async () => {
        const newState = !isPinned;
        setIsPinned(newState);

        try {
            if (note) {
                let currentFront = rawFrontmatter;
                let currentBody = content;

                if (!currentFront) {
                    const { front, body } = splitFrontMatter(note.body);
                    currentFront = front;
                    currentBody = body;
                }

                const newFront = updateFrontmatterValue(currentFront, 'alwaysOnTop', newState.toString());
                await saveNoteContent(currentBody, newFront, false);
            }
        } catch (e) {
            console.error('Failed to toggle pin:', e);
            setIsPinned(!newState);
        }
    }, [isPinned, note, rawFrontmatter, content, saveNoteContent]);

    /**
     * Minimize Toggle Handler
     */
    const handleToggleMinimizeWithSave = useCallback(async () => {
        await toggleMinimize();
        const nextState = !isMinimized; // toggleMinimize toggles logic state

        if (note) {
            // [Fix] ここも同様に修正
            let currentFront = rawFrontmatter;
            let currentBody = content;

            if (!currentFront) {
                const { front, body } = splitFrontMatter(note.body);
                currentFront = front;
                currentBody = body;
            }

            const newFront = updateFrontmatterValue(currentFront, 'folded', nextState.toString());
            await saveNoteContent(currentBody, newFront, false);
        }
    }, [isMinimized, toggleMinimize, note, rawFrontmatter, content, saveNoteContent]);

    // ============================================================
    // 初期化・イベントリスナー
    // ============================================================

    // 初期ロード（一度だけ実行）
    const hasInitializedRef = useRef(false);
    useEffect(() => {
        if (!urlPath) return;
        if (hasInitializedRef.current) return;
        hasInitializedRef.current = true;

        const myNote: NoteMeta = {
            path: urlPath,
            seq: 0,
            context: getFileName(urlPath),
            updated: ''
        };

        setSelectedFile(myNote);
        setIsNewNote(isNew);

        if (isNew) {
            // 新規ノート: readNoteをスキップし、直接編集モードで開始
            // ①空白画面 ②Loading ③表示→編集の切り替え を全て省略
            // initialIsEditing:true で既にisEditing=trueなので startEditing は早期リターンする
            // [FIX] Ticksを少し遅らせてDOMの描画とエディタの初期化完了後にフォーカスする
            setTimeout(() => {
                editorRef.current?.focusAndSelectFirstLine();
                getCurrentWindow().setFocus().catch(() => { });
            }, 100);
        } else {
            // 既存ノート: 通常のロードフロー
            // [FIX] loadNote() の結果を editBody にも反映する。
            // プールウィンドウは isEditing=true で起動するため、useEditMode の
            // 「!isEditing のときだけ editBody を更新する」同期 effect が動かず
            // エディタが空白になるバグを防ぐ。
            loadNote().then((body) => {
                if (body) {
                    console.log('[StickyNote] loadNote complete, syncing editBody. length=', body.length);
                    setEditBody(body);
                }
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [urlPath, isNew]);

    // イベントリスナー設定（move, resize）
    useEffect(() => {
        if (!selectedFile) return;

        let isMounted = true;
        let unlistenMove: (() => void) | null = null;
        let unlistenResize: (() => void) | null = null;

        const setupListeners = async () => {
            try {
                const win = getCurrentWindow();

                // unlisten関数自体がPromiseを返すTauri v2仕様への対策ラッパー
                const wrapUnlisten = (u: any) => () => {
                    try {
                        const p = u?.();
                        if (p && p.catch) p.catch(() => { });
                    } catch (e) { }
                };

                const uMove = await win.listen('tauri://move', () => {
                    saveWindowState();
                });
                const safeMove = wrapUnlisten(uMove);
                if (isMounted) unlistenMove = safeMove; else safeMove();

                const uResize = await win.listen('tauri://resize', () => {
                    saveWindowState();
                });
                const safeResize = wrapUnlisten(uResize);
                if (isMounted) unlistenResize = safeResize; else safeResize();

            } catch (err) {
                // Event listener setup failed
            }
        };

        setupListeners();

        return () => {
            isMounted = false;
            const safeUnlisten = (u: any) => {
                try {
                    const p = u?.();
                    if (p && p.catch) p.catch(() => { });
                } catch (e) { }
            };
            safeUnlisten(unlistenMove);
            safeUnlisten(unlistenResize);
        };
    }, [selectedFile, saveWindowState]);

    // クローズリスナー（onCloseRequested）を分離: saveWindowState/isEditing の変化で
    // 再登録されると一瞬リスナーが外れてウィンドウが閉じるバグを防ぐ
    useEffect(() => {
        if (!selectedFile) return;

        let isMounted = true;
        let unlistenClose: (() => void) | null = null;

        const setupClose = async () => {
            try {
                const win = getCurrentWindow();
                const wrapUnlisten = (u: any) => () => {
                    try {
                        const p = u?.();
                        if (p && p.catch) p.catch(() => { });
                    } catch (e) { }
                };

                const uClose = await win.onCloseRequested(async (event) => {
                    if (isDeletingRef.current || isHandlingCloseRef.current) return;
                    // Alt+F4 等の外部クローズ要求は常にブロック（再表示手段がないため）
                    event.preventDefault();
                    if (isEditingForListenerRef.current) {
                        isHandlingCloseRef.current = true;
                        await endEditingForListenerRef.current();
                        isHandlingCloseRef.current = false;
                    }
                });
                const safeClose = wrapUnlisten(uClose);
                if (isMounted) unlistenClose = safeClose; else safeClose();

            } catch (err) {
                // setup failed
            }
        };

        setupClose();

        return () => {
            isMounted = false;
            try {
                const p = unlistenClose?.();
                if (p && (p as any).catch) (p as any).catch(() => { });
            } catch (e) { }
        };
    }, [selectedFile]); // deps は selectedFile のみ（state は ref 経由で参照）

    // [NEW] Alt+Tab表示制御: フォーカス時にRustへ通知（selectedFileに依存しない独立したuseEffect）
    useEffect(() => {
        const win = getCurrentWindow();
        let unlisten: (() => void) | null = null;

        const setup = async () => {
            try {
                // まずこのウィンドウをAlt+Tabから隠す（フォーカス前は非表示）
                await invoke('fusen_make_tool_window');

                // 既にフォーカス済みの場合は即座に表示登録
                const focused = await win.isFocused();
                if (focused) {
                    await invoke('fusen_set_as_alt_tab_window', { label: win.label });
                }

                unlisten = await win.listen('tauri://focus', async () => {
                    try {
                        await invoke('fusen_set_as_alt_tab_window', { label: win.label });
                    } catch (e) {
                        // fusen_set_as_alt_tab_window failed
                    }
                });
            } catch (e) {
                // AltTab setup failed
            }
        };

        setup();

        return () => {
            try {
                const p = (unlisten as any)?.();
                if (p && p.catch) p.catch(() => { });
            } catch (e) { }
        };
    }, []); // 起動時に一度だけ登録

    // [NEW] プールからの昇格（Promote）処理
    useEffect(() => {
        if (!isPool) return;

        let unlisten: (() => void) | undefined;
        let mounted = true; // [FIX] React Strict Mode のダブルsetup対策

        const setup = async () => {
            // [ROOT FIX] global な listen ではなく、このウィンドウ固有の listen を使う。
            // Tauri の global listen は emitTo で宛先を絞っても全ウィンドウに届いてしまう。
            // getCurrentWebviewWindow().listen を使うことで、このウィンドウ宛てのイベントだけ受け取る。
            const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
            const thisWin = getCurrentWebviewWindow();

            const u = await thisWin.listen<{ path: string, isNew?: boolean, content?: string, frontmatter?: string, targetPhysX?: number, targetPhysY?: number, targetPhysWidth?: number, targetPhysHeight?: number }>('fusen:promote_from_pool', async (event) => {
                const ts = new Date().toLocaleTimeString('ja-JP');
                isPromotingRef.current = true; // 付箋表示中フラグ ON（フォーカスが外れても編集モードを維持する）
                invoke('fusen_debug_log', { message: `[POOL_PROMOTE|${ts}] START label=${thisWin.label} target=(${event.payload.targetPhysX},${event.payload.targetPhysY}) size=${event.payload.targetPhysWidth}x${event.payload.targetPhysHeight}` }).catch(() => { });

                if (event.payload.isNew) {
                    setIsNewState(true);
                    if (event.payload.frontmatter !== undefined) {
                        setRawFrontmatter(event.payload.frontmatter);
                        setContent(event.payload.content || '');
                    } else if (event.payload.content) {
                        const { front, body } = splitFrontMatter(event.payload.content);
                        setRawFrontmatter(front);
                        setContent(body);
                    }
                }

                // リロード時にプールとして再認識されないようURLを書き換え
                window.history.replaceState(null, '', `/?path=${encodeURIComponent(event.payload.path)}`);

                noteFilePathRef.current = event.payload.path; // 即座に確定（stale closure 対策）
                setDynamicUrlPath(event.payload.path); // React state 更新（非同期だが pathRef で補完）
                isPoolRef.current = false; // 即座に確定（stale closure 対策）
                setIsPool(false); // プールモード解除

                // 待機中にフォーカスが外れて編集モードが解除されている可能性があるため、明示的に編集モードを開始
                startEditing();

                // ウィンドウの表示・サイズ・位置をRust側でまとめて設定する。
                // JS側から個別に設定すると順序のズレでクラッシュするため、Rust側で一括処理している。
                // 座標が指定されていない場合は現在位置を維持する。
                try {
                    await invoke('fusen_show_at_position', {
                        label: thisWin.label,
                        physX: event.payload.targetPhysX ?? null,
                        physY: event.payload.targetPhysY ?? null,
                        physWidth: event.payload.targetPhysWidth ?? 400,
                        physHeight: event.payload.targetPhysHeight ?? 300,
                    });
                    invoke('fusen_debug_log', { message: `[POOL_PROMOTE|${ts}] fusen_show_at_position OK pos=(${event.payload.targetPhysX ?? 'NOMOVE'},${event.payload.targetPhysY ?? 'NOMOVE'})` }).catch(() => { });
                } catch (e) {
                    invoke('fusen_debug_log', { message: `[POOL_PROMOTE|${ts}] fusen_show_at_position FAILED: ${e} – falling back to show()` }).catch(() => { });
                    await thisWin.show();
                }

                // 実際の位置を確認
                try {
                    const finalPos = await thisWin.outerPosition();
                    invoke('fusen_debug_log', { message: `[POOL_PROMOTE|${ts}] FINAL pos=(${finalPos.x},${finalPos.y})` }).catch(() => { });
                } catch (e) { /* ignore */ }

                // CodeMirror のレイアウトを再計算させる（hidden→visible 時に必要）
                window.dispatchEvent(new Event('resize'));

                // [FIX] Rust側でSetForegroundWindowを呼ぶため、JS側のsetFocusは不要。
                // 300ms 待つことで ITaskbarList 操作完了後に確実にフォーカスを取得する。
                setTimeout(async () => {
                    isPromotingRef.current = false; // 付箋表示中フラグ OFF
                    // フォーカスが外れて編集モードが解除された場合に備えて、強制的に編集モードをONにする
                    setIsEditing(true);
                    // Reactの再レンダリングを待ってからフォーカス
                    await new Promise(r => setTimeout(r, 80));
                    invoke('fusen_debug_log', { message: `[POOL_PROMOTE|${ts}] focus attempt: editorRef=${!!editorRef.current}` }).catch(() => { });
                    if (event.payload.isNew) {
                        editorRef.current?.focusAndSelectFirstLine();
                    } else {
                        editorRef.current?.focus();
                    }
                    invoke('fusen_debug_log', { message: `[POOL_PROMOTE|${ts}] focus+cursor applied, editorRef=${!!editorRef.current}` }).catch(() => { });
                }, 300);
            });
            // [FIX] React Strict Mode でダブルsetupが起きた場合、cleanup後にlistenが解決したら即解除
            if (!mounted) { u(); return; }
            unlisten = u;
        };
        setup();

        return () => {
            mounted = false;
            if (unlisten) unlisten();
        };
    }, [isPool, startEditing]);

    // リロードイベントリスナー
    useEffect(() => {
        if (!selectedFile) return;

        // [FIX] listener leak 防止: キャンセルフラグを使う
        let unlistenReload: (() => void) | null = null;
        let cancelled = false;

        const wrapUnlisten = (u: any) => () => {
            try {
                const p = u?.();
                if (p && p.catch) p.catch(() => { });
            } catch (e) { }
        };

        const setupListener = async () => {
            try {
                const uReload = await listen<{ path: string }>('fusen:reload_note', async (event) => {
                    const targetPath = event.payload?.path;
                    if (targetPath && selectedFile?.path && pathsEqual(targetPath, selectedFile.path)) {
                        console.log('[DBG:reload_note] FIRED targetPath=', targetPath, 'isEditing=', isEditingForListenerRef.current, 'stack=', new Error().stack?.split('\n').slice(1,3).join(' | '));
                        const body = await loadNote();
                        // [FIX] loadNote()が失敗して空を返した場合は上書きしない（C-2対策）
                        if (!body) {
                            console.error('[StickyNote] reload_note: loadNote returned empty, skipping content update to prevent data loss.');
                            return;
                        }
                        console.log('[DBG:reload_note] setContent+setEditBody body=', JSON.stringify(body.slice(0, 50)));
                        setContent(body);
                        setEditBody(body);

                        // [再発防止] reload後にnoteのタグを再同期する
                        // note stateはloadNote()内で更新されるため、useEffect(note)が発火するまでの
                        // タイムラグを埋めるためにフロントマターから直接タグを抽出して即時反映する
                        const { splitFrontMatter: split } = await import('@/app/utils/splitFrontMatter');
                        const { front } = split(body);
                        const tagMatch = front.match(/(?:^|\n)tags:\s*\[([^\]]*)\]/);
                        if (tagMatch) {
                            const reloadedTags = tagMatch[1]
                                .split(',')
                                .map((t: string) => t.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, ''))
                                .filter((t: string) => t.length > 0);
                            setCurrentTags(reloadedTags);
                        } else {
                            // tagsフィールドが空または存在しない場合
                            const emptyMatch = front.match(/(?:^|\n)tags:\s*\[\s*\]/);
                            if (emptyMatch) setCurrentTags([]);
                        }

                        // isEditing は ref から取得（stale closure 回避）
                        if (isEditingForListenerRef.current) {
                            setIsEditing(false);
                        }
                    }
                });
                // [FIX] listen() 解決後にすでにクリーンアップ済みなら即 unlisten
                if (cancelled) { wrapUnlisten(uReload)(); return; }
                unlistenReload = wrapUnlisten(uReload);
            } catch (err) {
                // reload_note listener setup failed
            }
        };

        setupListener();

        return () => {
            cancelled = true;
            const safeUnlisten = (u: any) => {
                try {
                    const p = u?.();
                    if (p && p.catch) p.catch(() => { });
                } catch (e) { }
            };
            safeUnlisten(unlistenReload);
        };
        // [FIX] deps を selectedFile のみに絞る（loadNote は path 変更時のみ再生成、isEditing は ref 経由）
    }, [selectedFile, loadNote]);

    // 全文検索スクロールイベントリスナー
    useEffect(() => {
        if (!selectedFile) return;

        // [FIX] listener leak 防止: async listen() の解決前に deps が変わっても安全に unlisten できるようにする
        let unlisten: (() => void) | undefined;
        let cancelled = false;

        const wrapUnlisten = (u: any) => () => {
            try {
                const p = u?.();
                if (p && p.catch) p.catch(() => { });
            } catch (e) { }
        };

        const setupScrollToLineListener = async () => {
            try {
                const uScroll = await listen<{ path: string; line: number; query?: string }>(
                    'fusen:scroll_to_line',
                    async (event) => {
                        const { path: targetPath, line, query } = event.payload;

                        if (!pathsEqual(targetPath, selectedFile.path)) return;

                        // [FIX] state の stale closure を避けるため ref から最新値を取得
                        const currentIsEditing = isEditingForListenerRef.current;
                        const currentContent = contentForListenerRef.current;

                        console.log('[StickyNote] scroll_to_line received. isEditing=', currentIsEditing, 'contentLen=', currentContent.length, 'line=', line, 'query=', query);

                        if (!currentIsEditing) {
                            startEditingForListenerRef.current();
                        }

                        await new Promise((r) => setTimeout(r, 100));

                        if (editorRef.current) {
                            // wait後も ref から最新のcontentを取得
                            const latestContent = contentForListenerRef.current;
                            if (!latestContent) {
                                console.warn('[StickyNote] scroll_to_line: content empty at jump time. Cursor set to 0.');
                                editorRef.current.setCursor(0);
                                return;
                            }
                            const lines = latestContent.split('\n');
                            const offset = lines.slice(0, line - 1).reduce((acc, l) => acc + l.length + 1, 0);

                            if (query) {
                                editorRef.current.highlightQuery(query);

                                if (line <= lines.length) {
                                    const lineContent = lines[line - 1] || '';
                                    const queryLower = query.toLowerCase();
                                    const matchIndex = lineContent.toLowerCase().indexOf(queryLower);

                                    if (matchIndex >= 0) {
                                        const start = offset + matchIndex;
                                        editorRef.current.setCursor(start);
                                        return;
                                    }
                                }
                            }

                            editorRef.current.setCursor(offset);
                        }
                    }
                );
                // [FIX] listen() 解決後にすでにクリーンアップ済みなら即 unlisten
                if (cancelled) { wrapUnlisten(uScroll)(); return; }
                unlisten = wrapUnlisten(uScroll);
            } catch (err) {
                // scroll_to_line listener setup failed
            }
        };

        setupScrollToLineListener();

        return () => {
            cancelled = true;
            const safeUnlisten = (u: any) => {
                try {
                    const p = u?.();
                    if (p && p.catch) p.catch(() => { });
                } catch (e) { }
            };
            safeUnlisten(unlisten);
        };
        // [FIX] deps を selectedFile のみに絞る。state は ref 経由で取得するため deps 不要。
    }, [selectedFile]);

    // 背景色をDOMに反映
    useEffect(() => {
        if (shellRef.current) {
            shellRef.current.style.setProperty('background-color', noteBackgroundColor, 'important');
        }
    }, [noteBackgroundColor]);

    // ============================================================
    // イベントハンドラー
    // ============================================================

    /**
     * チェックボックスのトグル処理
     */
    const handleToggleCheckbox = (lineIndex: number) => {
        const lines = (editBody || content).split('\n');
        if (lineIndex < 0 || lineIndex >= lines.length) return;

        const line = lines[lineIndex];
        const taskMatch = line.match(/^([\-\*\+]\s+\[)([ xX])(\]\s+.*)$/);

        if (taskMatch) {
            const isChecked = taskMatch[2].toLowerCase() === 'x';
            const newChar = isChecked ? ' ' : 'x';
            lines[lineIndex] = `${taskMatch[1]}${newChar}${taskMatch[3]}`;

            const newText = lines.join('\n');
            setContent(newText);
            setEditBody(newText);
            setSavePending(true);
        }
    };

    /**
     * 画像リサイズ処理
     */
    const handleImageResize = (newScale: number, baseOffset: number, originalText: string) => {
        if (!content) return;

        const targetStr = content.substring(baseOffset, baseOffset + originalText.length);
        if (targetStr !== originalText) return;

        const match = originalText.match(/!\[([^\]]*)\]\(([^)]+)\)/);
        if (!match) return;

        const rawAlt = match[1];
        const url = match[2];
        const altParts = rawAlt.split('|');
        const realAlt = altParts[0];

        const newMarkdown = `![${realAlt}|${newScale}](${url})`;
        const before = content.substring(0, baseOffset);
        const after = content.substring(baseOffset + originalText.length);

        const newContent = before + newMarkdown + after;
        setContent(newContent);
        setEditBody(newContent);
        setSavePending(true);
    };

    /**
     * タグ追加処理
     */
    const handleTagSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const tag = tagInputValue.trim();
        if (tag && selectedFile) {
            try {
                await addTagToNote(selectedFile.path, tag);
                // [FIX] UI即時更新: addTagToNote後にcurrentTagsをすぐ反映する
                if (!currentTags.includes(tag)) {
                    setCurrentTags([...currentTags, tag].sort());
                }
                // reload_noteでノート本文も最新化（タグのフロントマター含む）
                await import('@tauri-apps/api/event').then(({ emit }) => {
                    emit('fusen:reload_note', { path: selectedFile.path });
                });
            } catch (err) {
                console.error('[Tag] Failed to add tag:', err);
                alert('タグの追加に失敗しました。');
            }
        }
        setShowTagModal(false);
        setTagInputValue('');
    };

    /**
     * グローバルにタグを削除する処理
     */
    const executeTagDelete = async () => {
        if (!tagToDelete) return;
        const deletedTag = tagToDelete;

        try {
            await deleteTagFromAllNotes(deletedTag);

            // [FIX] UI即時更新: このノートのcurrentTagsからも削除
            setCurrentTags(currentTags.filter((t: string) => t !== deletedTag));

            // reload_noteでノート本文も最新化
            if (selectedFile) {
                await import('@tauri-apps/api/event').then(({ emit }) => {
                    emit('fusen:reload_note', { path: selectedFile.path });
                });
            }
        } catch (err) {
            console.error('[Tag] Failed to delete tag globally:', err);
            alert(`タグの全件削除に失敗しました。\n${err}`);
        }
        setTagToDelete(null); // モーダルを閉じてリセット
    };

    /**
     * テキスト選択変化時にフローティングバーの座標を更新
     */
    const handleSelectionChange = useCallback((coords: { top: number; left: number; bottom: number } | null) => {
        if (!coords || !editorHostRef.current) {
            setFloatBarCoords(null);
            return;
        }
        const rect = editorHostRef.current.getBoundingClientRect();
        setFloatBarCoords({
            top: coords.top - rect.top,
            left: Math.max(0, coords.left - rect.left),
        });
    }, []);

    // 編集モード終了時にフローティングバーを非表示
    useEffect(() => {
        if (!isEditing) setFloatBarCoords(null);
    }, [isEditing]);

    /**
     * 編集モード終了処理（handleEditBlur）
     */
    const handleEditBlur = useCallback(async (e?: FocusEvent) => {
        console.log('[DBG:handleEditBlur] called relatedTarget=', (e?.relatedTarget as Element)?.className ?? 'none');
        // [Fix] キャプチャ中は編集モードを維持する
        if (isCapturingRef.current) {
            console.log('[DBG:handleEditBlur] SKIP: isCapturing');
            return;
        }
        // 付箋表示中はフォーカスが外れても編集モードを解除しない
        if (isPromotingRef.current) {
            console.log('[DBG:handleEditBlur] SKIP: isPromoting');
            return;
        }

        // フォーカス移動先がツールバー内なら編集終了しない
        if (e && e.relatedTarget instanceof Element) {
            if (e.relatedTarget.closest('.hoverBar') || e.relatedTarget.closest('.floatBar') || e.relatedTarget.closest('.editorHost')) {
                console.log('[DBG:handleEditBlur] SKIP: relatedTarget in toolbar');
                return;
            }
        }
        await endEditing();
    }, [endEditing]);

    /**
     * ドラッグ開始処理
     */
    const handleDragStart = useCallback(async (e: React.PointerEvent) => {
        if (e.button !== 0) return;

        const target = e.target as HTMLElement;
        const isInteractive = !!target.closest('button, textarea, input, [data-interactable="true"], .cm-content, .editorHost');

        // 編集モード中かつエディタ内の操作なら、標準のドラッグ（テキスト選択）を妨害しない
        if (isEditing && isInteractive) {
            return;
        }

        // 編集モード中でエディタ外をクリックした場合
        // 以前は編集終了していたが、ユーザー要望により「カーソル移動」を優先するため
        // ここでの編集終了処理は行わない。
        // 代わりにエディタのフォーカスが外れたタイミングで終了するようにする。
        /*
        if (isEditing) {
            e.preventDefault();
            e.stopPropagation();
            handleEditBlur();
            return;
        }
        */

        // 編集終了直後(500ms)はガード（再編集入り防止）
        if (Date.now() - lastEditEndedAt.current < 500) {
            return;
        }

        // チェックボックスやボタンなど「操作が必要なパーツ」以外は、どこでもドラッグを許可する
        if (isInteractive) {
            return;
        }

        // startDragging() をマウスが実際に動いた瞬間（5px以上）に呼び出す。
        // 即時呼び出しだとダブルクリック2回目の pointerdown でも startDragging() が走り、
        // OSがマウスイベントを横取りして dblclick が届かなくなるケースがある。
        // 移動量ベースにすることで、クリック・ダブルクリックに干渉せず、
        // かつドラッグ開始の遅延もない。
        let dragStarted = false;

        const onPointerMove = (moveEvent: PointerEvent) => {
            if (dragStarted) return;
            const dx = moveEvent.clientX - e.clientX;
            const dy = moveEvent.clientY - e.clientY;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                dragStarted = true;
                try {
                    getCurrentWindow().startDragging();
                } catch (err) {
                    console.error('startDragging failed', err);
                }
            }
        };

        const onPointerUp = () => {
            cleanup();
            // ドラッグせずにクリックだけで終わった場合、編集モード中のみ編集終了する
            // （非編集時に呼ぶと startEditing との競合が起きるため除外）
            if (!dragStarted && isEditing) {
                handleEditBlur();
            }
        };
        const cleanup = () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
        };

        // e.preventDefault() を除去: これがあると Chromium の仕様で mousedown → click → dblclick
        // の連鎖がキャンセルされ、ダブルクリックによる編集開始が機能しなくなる。
        // テキスト選択防止は CSS の select-none で対応済み。
        e.stopPropagation();
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
    }, [isEditing, handleEditBlur, lastEditEndedAt]);

    /**
     * ウィンドウブラー時の編集終了
     */
    useEffect(() => {
        if (!isEditing) return;

        const onWindowBlur = () => {
            if (Date.now() < ignoreBlurUntilRef.current) {
                return;
            }
            handleEditBlur();
        };

        window.addEventListener('blur', onWindowBlur);
        return () => window.removeEventListener('blur', onWindowBlur);
    }, [isEditing, handleEditBlur, ignoreBlurUntilRef]);

    /**
     * 外側クリック時の編集終了
     */
    useEffect(() => {
        if (!isEditing) return;

        const onPointerDownCapture = (e: PointerEvent) => {
            const target = e.target as Node;

            if (editorHostRef.current?.contains(target)) {
                return;
            }
            if ((target as HTMLElement)?.closest?.('.hoverBar') || (target as HTMLElement)?.closest?.('.floatBar')) {
                return;
            }

            handleEditBlur();
        };

        window.addEventListener('pointerdown', onPointerDownCapture, true);
        return () => window.removeEventListener('pointerdown', onPointerDownCapture, true);
    }, [isEditing, handleEditBlur]);

    /**
     * ポインター追跡でドラッグ可能エリアを判定
     */
    useEffect(() => {
        const handleGlobalPointer = (e: PointerEvent) => {
            if (!shellRef.current) return;
            const rect = shellRef.current.getBoundingClientRect();

            const isInside = (
                e.clientX >= rect.left + 0.5 &&
                e.clientX <= rect.right - 0.5 &&
                e.clientY >= rect.top + 0.5 &&
                e.clientY <= rect.bottom - 0.5
            );

            if (!isInside && isHover) {
                // setIsHover(false); // React eventで管理するため無効化
                setIsDraggableArea(false);
            } else if (isInside) {
                // setIsHover(true); // React eventで管理するため無効化
                const target = e.target as HTMLElement;
                const interactive = target.closest('button, textarea, input, [data-interactable="true"]');

                if (interactive) {
                    setIsDraggableArea(false);
                } else {
                    // 全域をドラッグ可能にする
                    setIsDraggableArea(true);
                }
            }
        };

        const handleReset = () => {
            setIsHover(false);
            setIsDraggableArea(false);
        };

        window.addEventListener('pointermove', handleGlobalPointer);
        window.addEventListener('pointerleave', handleReset);
        window.addEventListener('blur', handleReset);
        return () => {
            window.removeEventListener('pointermove', handleGlobalPointer);
            window.removeEventListener('pointerleave', handleReset);
            window.removeEventListener('blur', handleReset);
        };
    }, [isHover]);

    /**
     * コンテキストメニュー処理（外部hook）
     */
    useStickyNoteContextMenu({
        selectedFile,
        t,
        language,
        allTags,
        currentTags,
        editBody,
        rawFrontmatter,
        saveNoteContent,
        loadAllTags,
        addTagToNote,
        removeTagFromNote,
        isDeletingRef,
        setNoteBackgroundColor,
        updateFrontmatter,
        shellRef,
        setShowTagModal,
        setTagInputValue,
        isEditing,
        handleEditBlur,
        onInsertText: (text: string) => {
            if (editorRef.current) {
                editorRef.current.insertText(text);
            }
        },
        setTagToDelete
    });

    /**
     * ローカルキーボードショートカット（この付箋ウィンドウがアクティブな時のみ有効）
     *
     * ショートカット一覧:
     *   Ctrl+N  → 新規付箋作成（ローカル: ここで定義）
     *   Ctrl+F  → 全文検索（ローカル: ここで定義）
     *   Ctrl+Shift+H → 全付箋の表示/非表示トグル（グローバル: src-tauri/src/lib.rs で定義）
     */
    useEffect(() => {
        const handleKeyDown = async (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                emit('fusen:open_search');
            }
            // [New] Ctrl+N: 新規付箋作成
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                // [FIX] 連打クラッシュ防止: 1.2秒以内の連続 emit をブロック
                const now = Date.now();
                if (now - lastCtrlNRef.current < 1200) return;
                lastCtrlNRef.current = now;
                if (selectedFile) {
                    const normalizedPath = selectedFile.path.replace(/\\/g, '/');
                    const folderPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));
                    const win = getCurrentWindow();
                    let sourcePhysX: number | undefined;
                    let sourcePhysY: number | undefined;
                    let sourceScale: number | undefined;
                    try {
                        const physPos = await win.outerPosition();
                        sourcePhysX = physPos.x;
                        sourcePhysY = physPos.y;
                        sourceScale = await win.scaleFactor();
                    } catch (e) {
                        invoke('fusen_debug_log', { message: `[CREATE_REQ] Ctrl+N outerPosition/scaleFactor FAILED: ${e}` }).catch(() => { });
                    }
                    emit('fusen:request_create', { folderPath, context: 'memo', sourcePhysX, sourcePhysY, sourceScale });
                }
            }

        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedFile]);

    // ============================================================
    // レンダリング
    // ============================================================
    // 初回レンダリング: ファイルパスがない場合で、プールでもない場合は何もしない
    if (!urlPath && !isPool) {
        return <div className="p-8">No path parameter</div>;
    }



    return (
        <div
            ref={shellRef}
            className="noteShell h-screen overflow-hidden flex flex-col"
            style={{
                backgroundColor: noteBackgroundColor,
                cursor: shellCursor,
                // [再発防止] レイアウト整合性のための定数定義
                // これらを変えることで、表示・編集モード問わず一貫した余白を保持する
                ['--editor-padding' as any]: '4px',
                ['--editor-margin-bottom' as any]: '4px',
                ['--footer-height' as any]: '20px',
            }}
            onPointerDown={handleDragStart}
            onPointerEnter={() => setIsHover(true)}
            onPointerLeave={() => setIsHover(false)}
        >
            <style>{`
                .notePaper::-webkit-scrollbar { width: 12px; height: 12px; }
                .notePaper::-webkit-scrollbar-track { background: transparent; }
                .notePaper::-webkit-scrollbar-thumb {
                    background-color: rgba(0, 0, 0, 0.2);
                    border-radius: 6px;
                    border: 3px solid transparent;
                    background-clip: content-box;
                }
                .notePaper::-webkit-scrollbar-thumb:hover { background-color: rgba(0, 0, 0, 0.5); }
            `}</style>

            {/* ツールバー */}
            <div className="absolute top-0 right-0 z-toolbar">
                <ToolbarButtons
                    isEditing={isEditing}
                    isMinimized={isMinimized}
                    isPinned={isPinned}
                    show={isHover && !isEditing}
                    onTable={() => editorRef.current?.insertTable()}
                    onMermaid={() => editorRef.current?.insertMermaid()}
                    onCapture={async () => {
                        if (isCapturingRef.current) return;
                        isCapturingRef.current = true;
                        await captureScreen();
                        isCapturingRef.current = false;
                    }}
                    onToggleMinimize={handleToggleMinimizeWithSave}
                    onTogglePin={handleTogglePin}
                    onCreateNewNote={async () => {
                        if (!selectedFile) return;
                        const normalizedPath = selectedFile.path.replace(/\\/g, '/');
                        const folderPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));
                        const win = getCurrentWindow();
                        let sourcePhysX: number | undefined;
                        let sourcePhysY: number | undefined;
                        let sourceScale: number | undefined;
                        try {
                            const physPos = await win.outerPosition();
                            sourcePhysX = physPos.x;
                            sourcePhysY = physPos.y;
                            sourceScale = await win.scaleFactor();
                        } catch (e) {
                            invoke('fusen_debug_log', { message: `[CREATE_REQ] + button outerPosition/scaleFactor FAILED: ${e}` }).catch(() => { });
                        }
                        invoke('fusen_debug_log', { message: `[CREATE_REQ] + clicked label=${win.label} sourcePhysX=${sourcePhysX} sourcePhysY=${sourcePhysY} scale=${sourceScale}` }).catch(() => { });
                        emit('fusen:request_create', { folderPath, context: 'memo', sourcePhysX, sourcePhysY, sourceScale });
                    }}
                />
            </div>

            {/* メインコンテンツ - 付箋のほぼ全域を占める */}
            <main
                className={`flex-1 flex flex-col overflow-auto relative ${isEditing ? 'p-0' : 'p-[var(--editor-padding)]'}`}
                onClick={(e) => {
                    // 編集モードで、エディタより下にあるこのコンテナ領域（＝黄色いフッタ領域）をクリックした場合は編集モードを終了
                    if (isEditing && e.target === e.currentTarget) {
                        console.log('[DBG:footer-click] handleEditBlur called');
                        handleEditBlur();
                    }
                }}
                onDoubleClick={(e) => {
                    // 表示モードでのダブルクリック（編集開始）
                    if (!isEditing && !isMinimized) {
                        e.preventDefault();
                        const target = e.target as HTMLElement;
                        const lineEl = target.closest('[data-line-index]');
                        if (lineEl) {
                            // テキスト行（白い部分）のダブルクリック
                            const lineIndex = parseInt(lineEl.getAttribute('data-line-index') || '0', 10);
                            const lines = content.split('\n');
                            let offset = 0;
                            for (let i = 0; i < lineIndex; i++) {
                                offset += (lines[i]?.length ?? 0) + 1; // +1 for newline
                            }
                            offset += lines[lineIndex]?.length ?? 0; // 行末
                            startEditing(offset);
                        } else {
                            // 行外（エディタ余白 または フッタ）のダブルクリック
                            const lineEls = e.currentTarget.querySelectorAll('[data-line-index]');
                            const lastLineEl = lineEls.length > 0 ? lineEls[lineEls.length - 1] as HTMLElement : null;
                            // 最後の行のbottomより下をクリックした場合はフッタ領域と判定
                            const isFooter = lastLineEl ? e.clientY > lastLineEl.getBoundingClientRect().bottom : true;

                            if (isFooter) {
                                // (B) フッタ領域: 全体の一番下（文末）から編集を始める
                                startEditing(content.length);
                            } else {
                                // (A) エディタ余白: クリック座標に最も近い文字から編集を始める
                                startEditing(undefined, { x: e.clientX, y: e.clientY });
                            }
                        }
                    }
                }}
            >
                {isMinimized ? (
                    // ミニマイズモード: MarkdownRendererエンジンを再利用して1行表示
                    <div
                        className="cursor-pointer select-none text-black flex-1 flex flex-col overflow-hidden"
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleMinimize();
                        }}
                        title="クリックで展開"
                    >
                        <MarkdownRenderer
                            content={content}
                            backgroundColor="transparent"
                            fontSize={noteFontSize}
                            isDraggableArea={false}
                            singleLinePreview={true} // [New] 省略表示モード
                            onCheckboxToggle={handleToggleCheckbox}
                            onImageResize={handleImageResize}
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                toggleMinimize();
                            }}
                            selectedFilePath={selectedFile?.path}
                            resolvePath={resolvePath}
                        />
                    </div>
                ) : loading ? (
                    <div className="text-center text-gray-300 py-8 text-xs font-mono opacity-30">
                        Loading...
                    </div>
                ) : isEditing ? (
                    // 編集モード
                    <div
                        className="editorHost notePaper flex flex-col cursor-text bg-transparent rounded mb-[var(--editor-margin-bottom)] w-full p-0"
                        ref={editorHostRef}
                    >
                        {/* [再発防止] RichTextEditor内部で height: 100% を強制し、この白いエリアを埋め尽くす */}
                        <RichTextEditor
                            ref={editorRef}
                            value={editBody}
                            onChange={(newValue) => {
                                setEditBody(newValue);
                                setSavePending(true);
                            }}
                            filePath={selectedFile?.path || ''}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') handleEditBlur();
                                // Tabキーでツールバーへフォーカス移動
                                if (e.key === 'Tab' && !e.shiftKey) {
                                    e.preventDefault();
                                    // ツールバー内の最初のボタンを探してフォーカス
                                    const toolbar = document.querySelector('.hoverBar');
                                    const firstButton = toolbar?.querySelector('button');
                                    if (firstButton) {
                                        (firstButton as HTMLElement).focus();
                                    }
                                }
                            }}
                            // エディタ自体は透明にして親の色を見せる
                            backgroundColor="transparent"
                            cursorPosition={cursorPosition}
                            initialCoords={initialCoords}
                            isNewNote={isNewNote}
                            fontSize={noteFontSize}
                            onBlur={handleEditBlur}
                            onSelectionChange={handleSelectionChange}
                        />
                        {floatBarCoords && (
                            <FloatingFormatBar
                                top={floatBarCoords.top}
                                left={floatBarCoords.left}
                                onBold={() => editorRef.current?.insertBold()}
                                onHeading={() => editorRef.current?.insertHeading1()}
                                onList={() => editorRef.current?.insertList()}
                                onCheckbox={() => editorRef.current?.insertCheckbox()}
                            />
                        )}
                    </div>
                ) : (
                    // 表示モード
                    <MarkdownRenderer
                        content={content}
                        backgroundColor={noteBackgroundColor}
                        fontSize={noteFontSize}
                        isDraggableArea={isDraggableArea}
                        onCheckboxToggle={handleToggleCheckbox}
                        onImageResize={handleImageResize}
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            setIsNewNote(false); // 再編集時は新規ノート扱いを解除
                            // クリック位置の行を特定し、その行末にカーソルを移動する
                            const target = e.target as HTMLElement;
                            const lineEl = target.closest('[data-line-index]');
                            if (lineEl) {
                                const lineIndex = parseInt(lineEl.getAttribute('data-line-index') || '0', 10);
                                const lines = content.split('\n');
                                let offset = 0;
                                for (let i = 0; i < lineIndex; i++) {
                                    offset += (lines[i]?.length ?? 0) + 1;
                                }
                                offset += lines[lineIndex]?.length ?? 0;
                                startEditing(offset);
                            } else {
                                startEditing(content.length);
                            }
                        }}
                        selectedFilePath={selectedFile?.path}
                        resolvePath={resolvePath}
                    />
                )}
            </main>

            {/* フッター領域 - 編集モード時のドラッグ操作用。最小限の高さに設定。 */}
            {isEditing && (
                <div
                    className="noteFooter"
                    style={{
                        height: 'var(--footer-height)',
                        cursor: 'grab',
                        userSelect: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        // 「エディタではない」ことを明確にするため、視覚的に区別できる背景を設定
                        backgroundColor: 'rgba(0, 0, 0, 0.08)',
                        borderTop: '1px solid rgba(0, 0, 0, 0.12)',
                        color: 'rgba(0, 0, 0, 0.3)',
                        fontSize: '12px',
                        letterSpacing: '4px',
                    }}
                    onPointerDown={handleDragStart}
                    title="ドラッグで移動"
                >
                    ⠿
                </div>
            )}

            {/* UI: リモート同期ステータス (将来の拡張用) */}
            {/*
            {settings.remote_sync_enabled && (
                <div
                    className="absolute bottom-ui-offset-y left-ui-offset-x font-mono text-[10px] tracking-widest pointer-events-none select-none"
                    style={{ color: `${noteBackgroundColor} filter invert(50%)` }}
                >
                    {syncStatus === 'syncing' && 'SYNCING...'}
                    {syncStatus === 'synced' && 'SYNCED'}
                    {syncStatus === 'error' && 'SYNC ERROR'}
                </div>
            )}
            */}

            {/* タグ表示エリア（右下、ホバー時のみ） */}
            {!isEditing && !isMinimized && currentTags.length > 0 && (
                <div
                    className="absolute bottom-ui-offset-y right-ui-offset-x z-tags pointer-events-none flex justify-end"
                    style={{ opacity: isHover ? 1 : 0, transition: 'opacity 0.2s ease' }}
                >
                    <div className="flex gap-1 flex-wrap max-w-[250px] justify-end">
                        {currentTags.slice(0, 3).map((tag: string, idx: number) => (
                            <span
                                key={idx}
                                className="text-[10px] px-2 py-[3px] bg-gray-200/80 text-gray-700 rounded border border-gray-300/80 whitespace-nowrap font-medium shadow-sm"
                            >
                                {tag.length > 4 ? `${tag.substring(0, 4)}...` : tag}
                            </span>
                        ))}
                        {currentTags.length > 3 && (
                            <span
                                className="text-[10px] px-2 py-[3px] bg-gray-200/50 text-gray-500 rounded border border-gray-300/50 whitespace-nowrap font-medium"
                            >
                                +{currentTags.length - 3}
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* 新規タグ追加モーダル */}
            {showTagModal && (
                <div
                    className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm"
                    onPointerDown={(e) => {
                        e.stopPropagation();
                        if (e.target === e.currentTarget) {
                            setShowTagModal(false);
                        }
                    }}
                >
                    <div
                        className="bg-white p-6 rounded-xl shadow-2xl flex flex-col gap-4 w-[85%] max-w-[320px] transform scale-100 opacity-100 transition-all"
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-gray-800 font-bold text-lg mb-2 flex items-center gap-2">
                            <span>🏷️</span> 新規タグを追加
                        </h3>
                        <form onSubmit={handleTagSubmit} className="flex flex-col gap-4">
                            <input
                                autoFocus
                                type="text"
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50 text-sm"
                                placeholder="例: Todo, アイデア, etc..."
                                value={tagInputValue}
                                onChange={(e) => setTagInputValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') {
                                        setShowTagModal(false);
                                    }
                                }}
                            />
                            <div className="flex justify-end gap-2 mt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowTagModal(false)}
                                    className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    キャンセル
                                </button>
                                <button
                                    type="submit"
                                    disabled={!tagInputValue.trim()}
                                    className="px-6 py-2 text-sm font-bold text-white bg-purple-600 rounded-lg disabled:opacity-50 hover:bg-purple-700 transition-colors shadow-md"
                                >
                                    追加
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* グローバルタグ削除の確認ダイアログ */}
            <ConfirmDialog
                isOpen={!!tagToDelete}
                title="タグの削除"
                message={`タグ「${tagToDelete}」を完全に削除しますか？\n\n※この操作は元に戻せません。このタグを含む**すべての付箋**からバッジが消去されます。付箋本体は消去されません。`}
                onConfirm={executeTagDelete}
                onCancel={() => setTagToDelete(null)}
            />

            {/* 自動保存失敗トースト */}
            <SaveErrorToast
                isVisible={showSaveError}
                onDismiss={() => setShowSaveError(false)}
            />

        </div >
    );
});

// [NEW] ErrorBoundaryでラップしてエクスポート
// エラー発生時に付箋ウィンドウが白画面にならず、再試行ボタン付きエラー UI を表示する
export default function StickyNoteWithBoundary() {
    return (
        <ErrorBoundary>
            <StickyNote />
        </ErrorBoundary>
    );
}
