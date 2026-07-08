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

import { useState, useEffect, useCallback, useRef, memo, useMemo, lazy, Suspense } from 'react';
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
import type { RichTextEditorRef } from './RichTextEditor';
import ToolbarButtons from './ToolbarButtons';
import FloatingFormatBar from './FloatingFormatBar';
import MarkdownRenderer from './MarkdownRenderer';
import ImageAnnotationModal from './ImageAnnotationModal';
import ConfirmDialog from './ConfirmDialog';
import AlarmDialog from './AlarmDialog';
import SaveErrorToast from './SaveErrorToast';
import Tooltip from './Tooltip';


// ユーティリティ
import { pathsEqual, getFileName, decodeNotePathFromUrl } from '../utils/pathUtils';
import { splitFrontMatter, updateFrontmatterValue, removeFrontmatterKey, updateFrontmatterGeometry } from '../utils/splitFrontMatter';
import { resolvePath } from '../utils/markdownUtils';
import { safeUnlisten } from '../utils/safeUnlisten';
import { playCheckboxSound, playSaveSound } from '../utils/soundManager';
import { matchesShortcut } from '../utils/shortcutKey';
import { appendImprovementHistoryLine, createImprovementHistoryLine, getChangedRecipeSections } from '../utils/recipeFormat';

// API
import { NoteMeta } from '@/app/api/notes';
import { returnRecipe } from '@/app/api/recipes';
import { invoke } from '@tauri-apps/api/core';

// 設定・国際化
import { useSettings } from "@/lib/settings-store";
import { getTranslation, type Language } from "@/lib/i18n";
import ErrorBoundary from './ErrorBoundary';

const loadRichTextEditor = () => import('./RichTextEditor');
const RichTextEditor = lazy(loadRichTextEditor);

// ホバーフォーカスのレートリミット用変数
let hoverFocusTimer: NodeJS.Timeout | null = null;

const StickyNote = memo(function StickyNote() {
    const searchParams = useSearchParams();
    // [NEW] プールモード判定と動的パス
    const isPoolParams = searchParams.get('isPool') === 'true';
    const [dynamicUrlPath, setDynamicUrlPath] = useState<string | null>(() => {
        const pathParam = searchParams.get('path');
        return pathParam ? decodeNotePathFromUrl(pathParam) : null;
    });
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

    useEffect(() => {
        if (process.env.NODE_ENV === 'test') return;
        void loadRichTextEditor();
    }, []);


    const [isNewNote, setIsNewNote] = useState(isNew);

    // フローティングフォーマットバー
    const [floatBarCoords, setFloatBarCoords] = useState<{ top: number; left: number; flip?: boolean } | null>(null);

    // UI状態
    const [isHover, setIsHover] = useState(false);
    const [isDraggableArea, setIsDraggableArea] = useState(false);
    const [shellCursor, setShellCursor] = useState('default');

    // 画像アノテーションモーダル
    const [annotationTarget, setAnnotationTarget] = useState<{ path: string; url: string } | null>(null);
    const [imageVersion, setImageVersion] = useState(0);

    // タグモーダル
    const [showTagModal, setShowTagModal] = useState(false);
    const [tagInputValue, setTagInputValue] = useState('');
    const [tagToDelete, setTagToDelete] = useState<string | null>(null);

    // 保存失敗トースト
    const [showSaveError, setShowSaveError] = useState(false);

    // トースト
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // アラーム
    const [showAlarmDialog, setShowAlarmDialog] = useState(false);
    const [isAlarmRinging, setIsAlarmRinging] = useState(false);
    const [alarmNowStr, setAlarmNowStr] = useState('');


    // Refs
    const editorRef = useRef<RichTextEditorRef>(null);
    const editorHostRef = useRef<HTMLDivElement>(null);
    const shellRef = useRef<HTMLDivElement>(null);
    const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
    const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
    const isCapturingRef = useRef(false);
    const isPromotingRef = useRef(false); // 付箋表示中はフォーカスが外れても編集モードを維持する
    const lastJsDoubleCtrlDownMsRef = useRef<number | null>(null);
    const lastJsDoubleCtrlFireMsRef = useRef<number>(0);
    // [REMOVED] lastCtrlNRef (JS 1.2s スロットル) は Pool アーキテクチャ移行により不要になった
    // フォールバック側は page.tsx 400ms グローバルスロットル + Rust 500ms セーフティで保護

    // [NEW] Pool 窓 lazy ファイル作成用 refs
    // firstCharFiredRef: 0→1 文字遷移を 1 回だけ検出するための再入防止フラグ（pitfall 5）
    const firstCharFiredRef = useRef<boolean>(false);
    // poolPromotedRef: pool 窓が promote されたことを記録（isPool が false になった後も参照可能）
    const poolPromotedRef = useRef<boolean>(isPoolParams);
    // lazyFolderPathRef: promote 時に受け取ったフォルダパス（1 文字目で fusen_create_note_lazy に渡す）
    const lazyFolderPathRef = useRef<string>('');
    // 文字入力と画像貼り付けが同時に lazy 作成を要求しても 1 回にまとめる
    const lazyCreatePromiseRef = useRef<Promise<string | null> | null>(null);
    const originalRecipeBodyRef = useRef<string | null>(null);
    const originalRecipePathRef = useRef<string | null>(null);

    // アラーム用 refs（setInterval内でstale closureを避けるため）
    const rawFrontmatterForAlarmRef = useRef('');
    const prevAlwaysOnTopRef = useRef<boolean>(false);
    const alarmSoundEnabledRef = useRef<boolean>(true);
    // 再生中の alarm Audio（即時停止用）
    const alarmAudioRef = useRef<HTMLAudioElement | null>(null);

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
        removeFrontmatter,
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
    const { noteBackgroundColor, setNoteBackgroundColor, noteFontSize, setNoteFontSize } = useNoteStyles(note, searchParams.get('bg'));

    // 削除・アーカイブ中の保存防止フラグ
    const isDeletingRef = useRef(false);
    // ウィンドウクローズ処理中フラグ（onCloseRequested 再入防止）
    const isHandlingCloseRef = useRef(false);

    // 保存処理のラッパー（削除中は保存しない）
    const handleSave = useCallback(async (body: string, front: string, allowRename: boolean) => {
        console.log('[DBG:handleSave] body=', JSON.stringify(body.slice(0, 50)), 'isPool=', isPool, 'poolPromoted=', poolPromotedRef.current, 'isNew=', isNew, 'isDeleting=', isDeletingRef.current);
        if (isDeletingRef.current) {
            console.log('[DBG:handleSave] SKIP: isDeleting');
            return;
        }
        // Pool 由来の窓（promote 前後）からの保存をすべてブロック
        // noteFilePathRef は ref で現在値を常に参照するため、deps に含める必要なし（ref は identity stable）
        if (isPoolRef.current || (poolPromotedRef.current && !noteFilePathRef.current)) {
            console.log('[DBG:handleSave] SKIP: isPool or poolPromoted without path');
            return;
        }

        await saveNoteContent(body, front, allowRename);
        if (isNew) {
            setIsNewState(false);
        }
    }, [saveNoteContent, isNew, isPool, noteFilePathRef]);

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
    useEffect(() => { rawFrontmatterForAlarmRef.current = rawFrontmatter; }, [rawFrontmatter]);
    const isPinnedRef = useRef(isPinned);
    useEffect(() => { isPinnedRef.current = isPinned; }, [isPinned]);
    const isEditingForListenerRef = useRef(isEditing);
    useEffect(() => { isEditingForListenerRef.current = isEditing; }, [isEditing]);
    const shouldRenderEditor = isEditing || process.env.NODE_ENV !== 'test';
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
    }, [isPool, setRawFrontmatter, setSavePending]); // isDeletingRef は ref（安定）

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
    const isRecipeNote = currentTags.some((tag: string) => tag.trim().toLowerCase() === 'recipe');

    // 初期ロード時に全タグを取得
    useEffect(() => {
        loadAllTags();
    }, [loadAllTags]);

    // スクリーンキャプチャ
    useEffect(() => {
        const path = selectedFile?.path ?? null;
        if (!path || !isRecipeNote) {
            originalRecipeBodyRef.current = null;
            originalRecipePathRef.current = null;
            return;
        }
        if (!loading && originalRecipePathRef.current !== path) {
            originalRecipeBodyRef.current = content;
            originalRecipePathRef.current = path;
        }
    }, [content, isRecipeNote, loading, selectedFile?.path]);

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
    // [FIX] プールウィンドウ（isPool=true）は urlPath=null で起動し、1文字目入力後に
    // handleFirstChar → fusen_create_note_lazy でファイルが作成されて urlPath が変わる。
    // このとき hasInitializedRef=false のまま useEffect が再発火すると
    // focusAndSelectFirstLine が再度呼ばれてカーソルが先頭にリセットされるバグがあった。
    // isPool=true の場合は最初から「初期化済み」とみなしてスキップすることで防ぐ。
    const hasInitializedRef = useRef(isPoolParams); // プールウィンドウは true で初期化
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
                    // Pool 窓は close-requested listener に任せる（自動的に cleanup が走る）
                    if (isPoolRef.current) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

            const u = await thisWin.listen<{ path?: string, folderPath?: string, isNew?: boolean, content?: string, frontmatter?: string, targetPhysX?: number, targetPhysY?: number, targetPhysWidth?: number, targetPhysHeight?: number, t0?: number, runId?: string }>('fusen:promote_from_pool', async (event) => {
                const ts = new Date().toLocaleTimeString('ja-JP');
                const perfT0 = event.payload.t0;
                isPromotingRef.current = true; // 付箋表示中フラグ ON（フォーカスが外れても編集モードを維持する）
                invoke('fusen_debug_log', { message: `[POOL_PROMOTE|${ts}] START label=${thisWin.label} target=(${event.payload.targetPhysX},${event.payload.targetPhysY}) size=${event.payload.targetPhysWidth}x${event.payload.targetPhysHeight}` }).catch(() => { });
                if (perfT0) {
                    invoke('fusen_debug_log', { message: `[PERF|T_PROMOTE_START] elapsed=${Date.now() - perfT0}ms (pool window received promote event)` }).catch(() => { });
                }

                let promotedBody: string | undefined;
                if (event.payload.isNew) {
                    setIsNewState(true);
                    setIsNewNote(true);
                    if (event.payload.frontmatter !== undefined) {
                        setRawFrontmatter(event.payload.frontmatter);
                        promotedBody = event.payload.content || '';
                        setContent(promotedBody);
                    } else if (event.payload.content) {
                        const { front, body } = splitFrontMatter(event.payload.content);
                        setRawFrontmatter(front);
                        promotedBody = body;
                        setContent(promotedBody);
                    }
                }

                // [NEW] Pool lazy 用フォルダパスを保存（1 文字目で fusen_create_note_lazy に渡す）
                // folderPath を promote payload から受け取る（Task 3 で page.tsx が送信）
                // 後方互換: path がある場合はそこから folder を算出
                if (event.payload.folderPath) {
                    lazyFolderPathRef.current = event.payload.folderPath;
                } else if (event.payload.path) {
                    const normalizedP = event.payload.path.replace(/\\/g, '/');
                    lazyFolderPathRef.current = normalizedP.substring(0, normalizedP.lastIndexOf('/'));
                }
                // [NEW] promote 後は firstCharFiredRef をリセット（最初の 0→1 文字で lazy 作成を発火させる）
                firstCharFiredRef.current = false;
                // [NEW] poolPromotedRef を true に（isPool が false になった後も判別できるようにする）
                poolPromotedRef.current = true;

                // リロード時にプールとして再認識されないようURLを書き換え
                if (event.payload.path) {
                    window.history.replaceState(null, '', `/?path=${encodeURIComponent(event.payload.path)}`);
                    noteFilePathRef.current = event.payload.path; // 即座に確定（stale closure 対策）
                    setDynamicUrlPath(event.payload.path); // React state 更新（非同期だが pathRef で補完）
                    // path が確定した（非lazy）場合のみプールモード解除
                    isPoolRef.current = false;
                    setIsPool(false);
                }
                // lazy（path 無し）の場合: ファイル未作成のため isPool=true を維持する。
                // handleFirstChar で fusen_create_note_lazy が成功した後に isPool を解除する。
                // ここで setIsPool(false) すると urlPath=null のまま「No path parameter」になる。

                // 待機中にフォーカスが外れて編集モードが解除されている可能性があるため、明示的に編集モードを開始
                startEditing();
                // [FIX] startEditing() は stale な initialContent（""）で editBody を上書きするため、
                // 複製・新規ノートのコンテンツを直接 setEditBody で反映する。
                if (promotedBody !== undefined) {
                    setEditBody(promotedBody);
                }

                // page.tsx が fusen_show_at_position（α=255 + SetWindowPos + SetForegroundWindow）を
                // 既に呼び済みのため、ここでの再呼び出しは不要（二重呼び出しで SetLayeredWindowAttributes が失敗する）。
                invoke('fusen_debug_log', { message: `[POOL_PROMOTE|${ts}] fusen_show_at_position already done by page.tsx pos=(${event.payload.targetPhysX ?? 'NOMOVE'},${event.payload.targetPhysY ?? 'NOMOVE'})` }).catch(() => { });
                if (perfT0) {
                    invoke('fusen_debug_log', { message: `[PERF|T1_VISIBLE] elapsed=${Date.now() - perfT0}ms (window shown at position by page.tsx)` }).catch(() => { });
                }

                // 実際の位置を確認（await しない: IPC 遅延で setTimeout 開始が遅れるのを防ぐ）
                thisWin.outerPosition().then(p => {
                    invoke('fusen_debug_log', { message: `[POOL_PROMOTE|${ts}] FINAL pos=(${p.x},${p.y})` }).catch(() => { });
                }).catch(() => { });

                // CodeMirror のレイアウトを再計算させる（hidden→visible 時に必要）
                window.dispatchEvent(new Event('resize'));

                // Rust が SetForegroundWindow をアトミックに完了済みのため、長い待機は不要。
                // rAF 1回でレイアウト確定を待つだけで十分（ITaskbarList 待機の 300ms は不要）。
                setTimeout(async () => {
                    isPromotingRef.current = false; // 付箋表示中フラグ OFF
                    // フォーカスが外れて編集モードが解除された場合に備えて、強制的に編集モードをONにする
                    setIsEditing(true);
                    // React 再レンダリング + CodeMirror レイアウト確定を rAF 1回で待つ
                    await new Promise(r => requestAnimationFrame(r));
                    invoke('fusen_debug_log', { message: `[POOL_PROMOTE|${ts}] focus attempt: editorRef=${!!editorRef.current}` }).catch(() => { });
                    if (event.payload.isNew) {
                        editorRef.current?.focusAndSelectFirstLine();
                    } else {
                        editorRef.current?.focus();
                    }
                    invoke('fusen_debug_log', { message: `[POOL_PROMOTE|${ts}] focus+cursor applied, editorRef=${!!editorRef.current}` }).catch(() => { });
                    if (perfT0) {
                        invoke('fusen_debug_log', { message: `[PERF|T2_READY] elapsed=${Date.now() - perfT0}ms (editor focused, ready for input)` }).catch(() => { });
                    }
                }, 50);
            });
            // [FIX] React Strict Mode でダブルsetupが起きた場合、cleanup後にlistenが解決したら即解除
            if (!mounted) { u(); return; }
            unlisten = u;

            // [REMOVED] 即時 emit は rAF 待機 effect に移動（pool ready 厳格化）
        };
        setup();

        return () => {
            mounted = false;
            safeUnlisten(unlisten);
        };
    }, [isPool, noteFilePathRef, setContent, setEditBody, setIsEditing, setRawFrontmatter, startEditing]);

    // [NEW] Pool 窓 ready 厳格化: CodeMirror マウント完了 + rAF 1 回経過後に emit
    // setTimeout 禁止（RESEARCH pitfall 6 / Pattern 3）
    useEffect(() => {
        if (!isPool) return;
        let cancelled = false;
        const waitReady = async () => {
            // (1) RichTextEditor が EditorView を構築するまで rAF で待つ
            while (!editorRef.current && !cancelled) {
                await new Promise(r => requestAnimationFrame(r));
            }
            if (cancelled) return;
            // (2) layout/paint 完了を保証する rAF 1 回
            await new Promise(r => requestAnimationFrame(r));
            if (cancelled) return;
            // (3) emit ready
            const { emit } = await import('@tauri-apps/api/event');
            const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
            emit('fusen:pool_window_ready', { label: getCurrentWebviewWindow().label }).catch(() => { });
        };
        waitReady();
        return () => { cancelled = true; };
    }, [isPool]);

    // [NEW] Pool 窓 close-without-input クリーンアップ（PERF-04 スロットルリーク防止）
    // 1 文字も入力せずに pool 窓を閉じた場合: usedPoolWindowsRef を解放し pool 補充をトリガ
    useEffect(() => {
        if (!isPool) return;
        let unlisten: (() => void) | undefined;
        (async () => {
            const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
            const win = getCurrentWebviewWindow();
            unlisten = await win.listen('tauri://close-requested', async () => {
                if (!firstCharFiredRef.current) {
                    // 1 文字も入力されていない → スロットルを解放して補充トリガ
                    const { emit } = await import('@tauri-apps/api/event');
                    await emit('fusen:pool_slot_released', { label: win.label });
                    invoke('fusen_create_pool_window').catch(e => console.warn('[POOL] replenish on close:', e));
                }
                // window close は Tauri のデフォルト動作に任せる（close() を明示的に呼ばない）
            });
        })();
        return () => { safeUnlisten(unlisten); };
    }, [isPool]);

    // [NEW] Pool 窓 lazy ファイル作成コールバック（0→1 文字遷移時に 1 回だけ呼ぶ）
    // RichTextEditor の onFirstChar prop に渡す。firstCharFiredRef で再入防止（pitfall 5）。
    // Atomic Coordination Constraint 厳守: invoke は 1 回のみ、複数 await 直列禁止。
    const handleFirstChar = useCallback(async (): Promise<string | null> => {
        if (noteFilePathRef.current) {
            return noteFilePathRef.current;
        }
        if (lazyCreatePromiseRef.current) {
            return lazyCreatePromiseRef.current;
        }
        // 再入防止: promote 後の最初の 0→1 文字遷移のみ発火
        if (firstCharFiredRef.current) return null;
        // pool 由来の窓のみ対象（pool 窓または pool から昇格した窓）
        if (!isPoolRef.current && !poolPromotedRef.current) return null;
        firstCharFiredRef.current = true;

        const folderPath = lazyFolderPathRef.current;
        if (!folderPath) {
            console.warn('[POOL] handleFirstChar: folderPath empty, skipping lazy create');
            return null;
        }

        lazyCreatePromiseRef.current = (async () => {
            const note = await invoke<{ meta: { path: string; seq: number; context: string; updated: string }; body: string; frontmatter: string }>('fusen_create_note_lazy', { folderPath, context: '' });
            invoke('fusen_debug_log', { message: `[POOL_LAZY] fusen_create_note_lazy OK path=${note.meta.path}` }).catch(() => { });
            // ファイルが作成されたので selectedFile と URL を更新
            const createdPath = note.meta.path;
            noteFilePathRef.current = createdPath;
            setDynamicUrlPath(createdPath);
            setSelectedFile(note.meta);
            window.history.replaceState(null, '', `/?path=${encodeURIComponent(createdPath)}`);
            // ファイル確定後にプールモード解除（handleSave が isPoolRef チェックでスキップしないように）
            isPoolRef.current = false;
            setIsPool(false);
            setRawFrontmatter(note.frontmatter);
            // T2_READY +5s 後に Pool 補充トリガを発火（1 文字目以降は 300ms 予算外なのでリソース消費 OK）
            setTimeout(() => {
                invoke('fusen_replenish_pool').catch(e => console.warn('[POOL] replenish failed:', e));
            }, 5000);
            return createdPath;
        })();

        try {
            return await lazyCreatePromiseRef.current;
        } catch (e) {
            console.error('[POOL] fusen_create_note_lazy failed:', e);
            firstCharFiredRef.current = false; // 失敗時はリセットして再挑戦を許可
            return null;
        } finally {
            lazyCreatePromiseRef.current = null;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // deps なし: 全て ref 経由でアクセスするため stale closure なし

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
    }, [selectedFile, loadNote, noteFilePathRef, setContent, setCurrentTags, setEditBody, setIsEditing, setRawFrontmatter]);

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFile]);

    // 背景色をDOMに反映
    useEffect(() => {
        if (shellRef.current) {
            shellRef.current.style.setProperty('background-color', noteBackgroundColor, 'important');
        }
    }, [noteBackgroundColor]);

    // アラームチェック（alarm_at がある場合のみ interval を作成）
    const hasAlarm = /alarm_at:/.test(rawFrontmatter);
    useEffect(() => {
        if (!selectedFile || isPool || !hasAlarm) return;

        const checkAlarm = async () => {
            const front = rawFrontmatterForAlarmRef.current;
            const alarmAtMatch = front.match(/alarm_at:\s*"([^"]+)"/);
            if (!alarmAtMatch) return;

            const alarmAt = new Date(alarmAtMatch[1]);
            if (isNaN(alarmAt.getTime())) return;
            if (Date.now() < alarmAt.getTime()) return;

            // 発火
            const soundMatch = front.match(/alarm_sound:\s*(\S+)/);
            alarmSoundEnabledRef.current = soundMatch ? soundMatch[1] === 'true' : true;
            prevAlwaysOnTopRef.current = isPinnedRef.current;

            // frontmatter から alarm_at / alarm_sound を削除（静的importを使用）
            const newFront1 = removeFrontmatterKey(front, 'alarm_at');
            const newFront2 = removeFrontmatterKey(newFront1, 'alarm_sound');

            // ref を即時更新（次の10秒チェックで再発火しないようにするため）
            rawFrontmatterForAlarmRef.current = newFront2;
            setRawFrontmatter(newFront2);
            await saveNoteContent(contentForListenerRef.current, newFront2, false);

            setIsAlarmRinging(true);
            await invoke('fusen_set_always_on_top', { enabled: true });
        };

        checkAlarm();
        const id = setInterval(checkAlarm, 10000);
        return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFile, isPool, hasAlarm]);

    // アラーム サウンドループ（alarm.wav を使用・段階的音量）
    useEffect(() => {
        if (!isAlarmRinging || !alarmSoundEnabledRef.current) return;

        let count = 0;
        const getVolume = () => {
            if (count < 3) return 0.25; // 小
            if (count < 6) return 0.6;  // 中
            return 1.0;                  // 大
        };

        const fire = () => {
            // 前の音を即時停止してから再生
            if (alarmAudioRef.current) {
                alarmAudioRef.current.pause();
                alarmAudioRef.current.currentTime = 0;
            }
            const audio = new Audio('/sounds/alarm.wav');
            audio.volume = getVolume();
            alarmAudioRef.current = audio;
            audio.play().catch(() => {});
            count++;
        };

        fire();
        const id = setInterval(fire, 3000);
        return () => {
            clearInterval(id);
            if (alarmAudioRef.current) {
                alarmAudioRef.current.pause();
                alarmAudioRef.current = null;
            }
        };
    }, [isAlarmRinging]);

    // アラーム発火中：現在時刻を1秒ごとに更新
    useEffect(() => {
        if (!isAlarmRinging) return;
        const update = () => {
            const now = new Date();
            const pad = (n: number) => n.toString().padStart(2, '0');
            setAlarmNowStr(`${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`);
        };
        update();
        const id = setInterval(update, 1000);
        return () => clearInterval(id);
    }, [isAlarmRinging]);

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

        // [GUARD] 画像行（![]() 形式）は絶対に変更しない
        if (/!\[.*?\]\(.*?\)/.test(line)) return;

        const taskMatch = line.match(/^([-\*\+]\s+\[)([ xX])(\]\s+.*)$/);

        if (taskMatch) {
            const isChecked = taskMatch[2].toLowerCase() === 'x';
            const newChar = isChecked ? ' ' : 'x';
            lines[lineIndex] = `${taskMatch[1]}${newChar}${taskMatch[3]}`;

            const newText = lines.join('\n');
            setContent(newText);
            setEditBody(newText);
            setSavePending(true);

            if (!isChecked) {
                void playCheckboxSound();
            }
        }
    };

    /**
     * 画像リサイズ処理
     */
    const handleImageResize = (newScale: number, baseOffset: number, originalText: string) => {
        if (!content) return;

        // [GUARD] スケール値の安全検証（ResizableImage 側でもクランプ済みだが二重防衛）
        const safeScale = Math.min(5.0, Math.max(0.1, newScale));
        if (!isFinite(safeScale)) return;

        const targetStr = content.substring(baseOffset, baseOffset + originalText.length);
        if (targetStr !== originalText) return;

        const match = originalText.match(/!\[([^\]]*)\]\(([^)]+)\)/);
        if (!match) return;

        const rawAlt = match[1];
        const url = match[2];
        // [GUARD] URLが空の場合は書き込みを中断
        if (!url.trim()) return;

        // alt テキスト部分のみ取り出す（| より前）
        const altParts = rawAlt.split('|');
        const realAlt = altParts[0]; // 空文字列でも問題ない

        const newMarkdown = `![${realAlt}|${safeScale}](${url})`;
        const before = content.substring(0, baseOffset);
        const after = content.substring(baseOffset + originalText.length);

        const newContent = before + newMarkdown + after;
        setContent(newContent);
        setEditBody(newContent);
        setSavePending(true);
    };

    const handleAnnotationClick = useCallback(async (absPath: string) => {
        const { convertFileSrc } = await import('@tauri-apps/api/core');
        setAnnotationTarget({ path: absPath, url: convertFileSrc(absPath) });
    }, []);

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
                alert(err instanceof Error ? err.message : 'タグの追加に失敗しました。');
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
        const BAR_HEIGHT = 36;
        const topRelative = coords.top - rect.top;
        const flip = topRelative < BAR_HEIGHT;
        setFloatBarCoords({
            top: flip ? coords.bottom - rect.top : topRelative,
            left: Math.max(0, coords.left - rect.left),
            flip,
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
     * アラーム設定確定（AlarmDialog onConfirm）
     */
    const handleConfirmAlarm = useCallback(async (alarmAt: string, alarmSound: boolean) => {
        setShowAlarmDialog(false);
        const newFront1 = updateFrontmatterValue(rawFrontmatter, 'alarm_at', `"${alarmAt}"`);
        const newFront2 = updateFrontmatterValue(newFront1, 'alarm_sound', alarmSound.toString());
        setRawFrontmatter(newFront2);
        await saveNoteContent(content, newFront2, false);
    }, [rawFrontmatter, content, saveNoteContent, setRawFrontmatter]);

    /**
     * アラーム解除（AlarmDialog onClear）
     */
    const handleClearAlarm = useCallback(async () => {
        setShowAlarmDialog(false);
        const newFront1 = removeFrontmatterKey(rawFrontmatter, 'alarm_at');
        const newFront2 = removeFrontmatterKey(newFront1, 'alarm_sound');
        setRawFrontmatter(newFront2);
        await saveNoteContent(content, newFront2, false);
    }, [rawFrontmatter, content, saveNoteContent, setRawFrontmatter]);

    /**
     * アラーム停止（点滅バークリック）
     */
    const handleStopAlarm = useCallback(async () => {
        // 再生中の音を即時停止
        if (alarmAudioRef.current) {
            alarmAudioRef.current.pause();
            alarmAudioRef.current = null;
        }
        setIsAlarmRinging(false);
        await invoke('fusen_set_always_on_top', { enabled: prevAlwaysOnTopRef.current });
    }, []);

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
    const resolveCreateFolderPath = useCallback(async (): Promise<string | null> => {
        if (selectedFile?.path) {
            const normalizedPath = selectedFile.path.replace(/\\/g, '/');
            const separatorIndex = normalizedPath.lastIndexOf('/');
            if (separatorIndex > 0) {
                return normalizedPath.substring(0, separatorIndex);
            }
        }

        if (lazyFolderPathRef.current) {
            return lazyFolderPathRef.current;
        }

        try {
            return await invoke<string | null>('get_base_path');
        } catch (e) {
            invoke('fusen_debug_log', { message: `[CREATE_REQ] get_base_path failed: ${e}` }).catch(() => { });
            return null;
        }
    }, [selectedFile]);

    const { handleDeleteNote } = useStickyNoteContextMenu({
        selectedFile,
        isPool,
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
        noteBackgroundColor,
        setNoteFontSize,
        globalFontSize: settings.font_size,
        updateFrontmatter,
        removeFrontmatter,
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
        setTagToDelete,
        onSetAlarm: () => setShowAlarmDialog(true),
        onToast: (msg: string) => {
            setToastMessage(msg);
            setTimeout(() => setToastMessage(null), 3000);
        },
        resolveCreateFolderPath,
        iphoneSendEnabled: settings.iphone_send_enabled,
    });

    const handleArchiveFromHoverButton = useCallback(async () => {
        if (!selectedFile || currentTags.length > 1) return;

        try {
            isDeletingRef.current = true;
            await saveNoteContent(editBody, rawFrontmatter, false);
            await playSaveSound();
            await invoke('fusen_archive_note', { path: selectedFile.path, targetTag: currentTags[0] ?? null });
            const win = getCurrentWindow();
            await win.hide();
            await win.destroy();
        } catch (e) {
            isDeletingRef.current = false;
            console.error('Failed to archive note:', e);
            alert(`${t('menu.archive_failed')}\n${e}`);
        }
    }, [selectedFile, currentTags, editBody, rawFrontmatter, saveNoteContent, isDeletingRef, t]);

    const handleReturnRecipe = useCallback(async () => {
        if (!selectedFile?.path || !isRecipeNote) return;

        try {
            const originalBody = originalRecipeBodyRef.current ?? content;
            const changed = getChangedRecipeSections(originalBody, content);
            const returnedBody = changed.length > 0
                ? appendImprovementHistoryLine(content, createImprovementHistoryLine(new Date(), changed))
                : content;

            isDeletingRef.current = true;
            await returnRecipe(selectedFile.path, returnedBody, changed.length > 0);
            const win = getCurrentWindow();
            await win.hide();
            await win.destroy();
        } catch (e) {
            isDeletingRef.current = false;
            console.error('Failed to return recipe:', e);
            alert(`レシピを返せませんでした\n${e}`);
        }
    }, [content, isRecipeNote, selectedFile?.path]);

    const handleOpenTagFolder = useCallback(async (tag: string) => {
        try {
            await invoke('fusen_open_tag_folder', { tag });
        } catch (e) {
            console.error('Failed to open tag folder:', e);
            alert(`${t('menu.openTagFolderFailed')}\n${e}`);
        }
    }, [t]);

    /**
     * ローカルキーボードショートカット（この付箋ウィンドウがアクティブな時のみ有効）
     *
     * ショートカット一覧:
     *   新規付箋ショートカット → 新規付箋作成（ローカル: ここで定義）
     *   Ctrl+F  → 全文検索（ローカル: ここで定義）
     *   Ctrl+Shift+H → 全付箋の表示/非表示トグル（グローバル: src-tauri/src/lib.rs で定義）
     */
    useEffect(() => {
        const handleKeyDown = async (e: KeyboardEvent) => {
            if ((settings.new_note_trigger ?? 'shortcut') === 'double_ctrl' && e.key === 'Control' && !e.repeat) {
                const now = performance.now();
                const lastDown = lastJsDoubleCtrlDownMsRef.current;
                const elapsed = lastDown === null ? Number.POSITIVE_INFINITY : now - lastDown;
                if (elapsed >= 40 && elapsed <= 650 && now - lastJsDoubleCtrlFireMsRef.current > 400) {
                    lastJsDoubleCtrlFireMsRef.current = now;
                    lastJsDoubleCtrlDownMsRef.current = null;
                    invoke('fusen_debug_log', { message: `[Shortcut] Ctrl*2 JS fallback detected elapsed_ms=${Math.round(elapsed)} label=${getCurrentWindow().label}` }).catch(() => { });
                    emit('fusen:request_create_global');
                    return;
                }
                lastJsDoubleCtrlDownMsRef.current = now;
            }
            // [New] F2: 編集モードに入る
            if (e.key === 'F2') {
                e.preventDefault();
                startEditingForListenerRef.current(editBodyRef.current.length);
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                emit('fusen:open_search');
            }
            // Ctrl+Delete: このメモを削除
            if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                e.preventDefault();
                await handleDeleteNote();
                return;
            }
            // [New] 設定された新規付箋ショートカット: 新規付箋作成
            if ((settings.new_note_trigger ?? 'shortcut') === 'shortcut' && matchesShortcut(e, settings.shortcut_new_note ?? 'ctrl+n')) {
                e.preventDefault();
                // [NEW] JS 1.2s スロットル撤去: Pool アーキテクチャで webview 新規作成しないためクラッシュ原因が消えた
                // フォールバック側（openNoteWindow）は page.tsx の 400ms global throttle + Rust 500ms で保護
                const folderPath = await resolveCreateFolderPath();
                if (!folderPath) {
                    invoke('fusen_debug_log', { message: '[CREATE_REQ] Ctrl+N skipped: folderPath unresolved' }).catch(() => { });
                    return;
                }
                    // [PERF] 起動時間計測: T0 = Ctrl+N 押下時刻
                    const t0 = Date.now();
                    invoke('fusen_debug_log', { message: `[PERF|T0] Ctrl+N keydown t0=${t0}` }).catch(() => { });
                    const win = getCurrentWindow();
                    let sourcePhysX: number | undefined;
                    let sourcePhysY: number | undefined;
                    let sourceScale: number | undefined;
                    let sourcePhysWidth: number | undefined;
                    let sourcePhysHeight: number | undefined;
                    try {
                        const physPos = await win.outerPosition();
                        sourcePhysX = physPos.x;
                        sourcePhysY = physPos.y;
                        sourceScale = await win.scaleFactor();
                        const physSize = await win.outerSize();
                        sourcePhysWidth = physSize.width;
                        sourcePhysHeight = physSize.height;
                    } catch (e) {
                        invoke('fusen_debug_log', { message: `[CREATE_REQ] Ctrl+N outerPosition/scaleFactor FAILED: ${e}` }).catch(() => { });
                    }
                    // outerSize() が失敗した場合は window.innerWidth/Height で補完する
                    if (sourcePhysWidth === undefined || sourcePhysHeight === undefined) {
                        const s = sourceScale ?? 1;
                        sourcePhysWidth = Math.round(window.innerWidth * s);
                        sourcePhysHeight = Math.round(window.innerHeight * s);
                    }
                    emit('fusen:request_create', { folderPath, context: 'memo', sourcePhysX, sourcePhysY, sourceScale, sourcePhysWidth, sourcePhysHeight, t0 });
            }

        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [editBodyRef, handleDeleteNote, resolveCreateFolderPath, settings.new_note_trigger, settings.shortcut_new_note]);

    // ============================================================
    // レンダリング
    // ============================================================
    // 初回レンダリング: ファイルパスがない場合で、プールでもない場合は何もしない
    if (!urlPath && !isPool) {
        return <div className="p-8">No path parameter</div>;
    }

    // アラーム情報（表示用）
    const alarmAtMatch = rawFrontmatter.match(/alarm_at:\s*"([^"]+)"/);
    const alarmAtStr = alarmAtMatch ? alarmAtMatch[1] : null;
    const alarmAtDate = alarmAtStr ? new Date(alarmAtStr) : null;
    const alarmSoundMatch = rawFrontmatter.match(/alarm_sound:\s*(\S+)/);
    const alarmSoundValue = alarmSoundMatch ? alarmSoundMatch[1] === 'true' : true;
    const alarmTooltip = (() => {
        if (!alarmAtDate) return '';
        const diffMs = alarmAtDate.getTime() - Date.now();
        const timeStr = alarmAtDate.toLocaleTimeString(language === 'ja' ? 'ja-JP' : 'en-US', { hour: '2-digit', minute: '2-digit' });
        const diffMin = Math.round(diffMs / 60000);
        if (diffMin <= 0) return language === 'ja' ? `${timeStr} にアラーム（まもなく）` : `Alarm at ${timeStr} (soon)`;
        if (diffMin < 60) return language === 'ja' ? `${timeStr} にアラーム（あと${diffMin}分）` : `Alarm at ${timeStr} (in ${diffMin}min)`;
        const diffHour = Math.round(diffMin / 60);
        return language === 'ja' ? `${timeStr} にアラーム（あと${diffHour}時間）` : `Alarm at ${timeStr} (in ${diffHour}h)`;
    })();



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
            onPointerEnter={() => {
                setIsHover(true);
                // [FIX] 複数ウィンドウを連続で横切った際のTauriクラッシュを防ぐため、150ms滞在した時のみフォーカスする
                if (!document.hasFocus()) {
                    if (hoverFocusTimer) clearTimeout(hoverFocusTimer);
                    hoverFocusTimer = setTimeout(async () => {
                        try {
                            const { getCurrentWindow } = await import('@tauri-apps/api/window');
                            if (!(await getCurrentWindow().isFocused())) {
                                console.log('[Focus] 150ms滞在を確認。ウィンドウをアクティブにします');
                                await getCurrentWindow().setFocus();
                            }
                        } catch (e) {
                            console.error('Failed to focus window on hover', e);
                        }
                    }, 150);
                }
            }}
            onPointerLeave={() => {
                setIsHover(false);
                if (hoverFocusTimer) {
                    console.log('[Focus] 通過しただけなのでフォーカス要求をキャンセルしました');
                    clearTimeout(hoverFocusTimer);
                    hoverFocusTimer = null;
                }
            }}
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

            {/* アラーム点滅バー */}
            {isAlarmRinging && (
                <div
                    onClick={handleStopAlarm}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        zIndex: 9999,
                        backgroundColor: '#dc2626',
                        color: '#fff',
                        textAlign: 'center',
                        padding: '6px 8px',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        userSelect: 'none',
                        animation: 'alarmBlink 0.6s ease-in-out infinite alternate',
                    }}
                >
                    <span style={{ fontFamily: 'monospace', marginRight: '8px', letterSpacing: '1px' }}>{alarmNowStr}</span>
                    {t('alarm.ringing')}
                </div>
            )}

            {/* ツールバー */}
            <div className="absolute top-0 right-0 z-toolbar">
                <ToolbarButtons
                    isEditing={isEditing}
                    isMinimized={isMinimized}
                    isPinned={isPinned}
                    show={isHover && !isEditing}
                    isWelcome={!isEditing && (selectedFile?.context?.includes('はじめての付箋') ?? (urlPath?.includes('はじめての付箋') ?? false))}
                    onTable={() => editorRef.current?.insertTable()}
                    onMermaid={() => editorRef.current?.insertMermaid()}
                    onCapture={async () => {
                        if (isCapturingRef.current) return;
                        isCapturingRef.current = true;
                        await captureScreen();
                        isCapturingRef.current = false;
                        await endEditing();
                    }}
                    onToggleMinimize={handleToggleMinimizeWithSave}
                    onTogglePin={handleTogglePin}
                    language={language}
                    onAlarmClick={() => setShowAlarmDialog(true)}
                    alarmAtStr={alarmAtStr}
                    alarmTooltip={alarmTooltip || t('menu.setAlarm')}
                    onCreateNewNote={async () => {
                        const folderPath = await resolveCreateFolderPath();
                        if (!folderPath) {
                            invoke('fusen_debug_log', { message: '[CREATE_REQ] + button skipped: folderPath unresolved' }).catch(() => { });
                            return;
                        }
                        const win = getCurrentWindow();
                        let sourcePhysX: number | undefined;
                        let sourcePhysY: number | undefined;
                        let sourceScale: number | undefined;
                        let sourcePhysWidth: number | undefined;
                        let sourcePhysHeight: number | undefined;
                        try {
                            const physPos = await win.outerPosition();
                            sourcePhysX = physPos.x;
                            sourcePhysY = physPos.y;
                            sourceScale = await win.scaleFactor();
                            const physSize = await win.outerSize();
                            sourcePhysWidth = physSize.width;
                            sourcePhysHeight = physSize.height;
                        } catch (e) {
                            invoke('fusen_debug_log', { message: `[CREATE_REQ] + button outerPosition/scaleFactor FAILED: ${e}` }).catch(() => { });
                        }
                        // outerSize() が失敗した場合は window.innerWidth/Height で補完する
                        if (sourcePhysWidth === undefined || sourcePhysHeight === undefined) {
                            const s = sourceScale ?? 1;
                            sourcePhysWidth = Math.round(window.innerWidth * s);
                            sourcePhysHeight = Math.round(window.innerHeight * s);
                            invoke('fusen_debug_log', { message: `[CREATE_REQ] outerSize fallback: innerWidth=${window.innerWidth} innerHeight=${window.innerHeight} scale=${s} → physW=${sourcePhysWidth} physH=${sourcePhysHeight}` }).catch(() => { });
                        }
                        invoke('fusen_debug_log', { message: `[CREATE_REQ] + clicked label=${win.label} sourcePhysX=${sourcePhysX} sourcePhysY=${sourcePhysY} scale=${sourceScale} physW=${sourcePhysWidth} physH=${sourcePhysHeight}` }).catch(() => { });
                        emit('fusen:request_create', { folderPath, context: 'memo', sourcePhysX, sourcePhysY, sourceScale, sourcePhysWidth, sourcePhysHeight });
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
                    <Tooltip text={t('tooltip.expand')}>
                        <div
                            className="cursor-pointer select-none text-black flex-1 flex flex-col overflow-hidden"
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleMinimize();
                            }}
                        >
                            <MarkdownRenderer
                                content={content}
                                backgroundColor="transparent"
                                fontSize={noteFontSize}
                                isDraggableArea={false}
                                singleLinePreview={true} // [New] 省略表示モード
                                recipeMode={isRecipeNote}
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
                    </Tooltip>
                ) : loading ? (
                    <div className="text-center text-gray-300 py-8 text-xs font-mono opacity-30">
                        Loading...
                    </div>
                ) : (
                    <>
                    {/* 編集モード */}
                    <div
                        className="editorHost notePaper flex flex-col cursor-text bg-transparent rounded mb-[var(--editor-margin-bottom)] w-full p-0"
                        ref={editorHostRef}
                        aria-hidden={!isEditing}
                        style={{
                            position: isEditing ? 'relative' : 'absolute',
                            inset: isEditing ? undefined : 0,
                            visibility: isEditing ? 'visible' : 'hidden',
                            pointerEvents: isEditing ? 'auto' : 'none',
                            zIndex: isEditing ? 20 : 0,
                        }}
                    >
                        {/* [再発防止] RichTextEditor内部で height: 100% を強制し、この白いエリアを埋め尽くす */}
                        {shouldRenderEditor && (
                            <Suspense fallback={<div className="w-full h-full bg-transparent" />}>
                                <RichTextEditor
                                    ref={editorRef}
                                    value={editBody}
                                    onChange={(newValue) => {
                                        setEditBody(newValue);
                                        setSavePending(true);
                                    }}
                                    filePath={selectedFile?.path || ''}
                                    onKeyDown={(e) => {
                                        if (!isEditing) return;
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
                                    onBlur={isEditing ? handleEditBlur : undefined}
                                    onSelectionChange={isEditing ? handleSelectionChange : undefined}
                                    onFirstChar={isEditing ? handleFirstChar : undefined}
                                    onEnsureFilePath={isEditing ? handleFirstChar : undefined}
                                />
                            </Suspense>
                        )}
                        {isEditing && floatBarCoords && (
                            <FloatingFormatBar
                                top={floatBarCoords.top}
                                left={floatBarCoords.left}
                                flip={floatBarCoords.flip}
                                onBold={() => editorRef.current?.insertBold()}
                                onHeading={() => editorRef.current?.insertHeading1()}
                                onList={() => editorRef.current?.insertList()}
                                onCheckbox={() => editorRef.current?.insertCheckbox()}
                                language={language}
                            />
                        )}
                    </div>
                    {!isEditing && (
                        <MarkdownRenderer
                            content={content}
                            backgroundColor={noteBackgroundColor}
                            fontSize={noteFontSize}
                            isDraggableArea={isDraggableArea}
                            recipeMode={isRecipeNote}
                            onCheckboxToggle={handleToggleCheckbox}
                            onImageResize={handleImageResize}
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                setIsNewNote(false);
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
                            onAnnotationClick={handleAnnotationClick}
                            imageVersion={imageVersion}
                        />
                    )}
                    </>
                )}
            </main>

            {/* フッター領域 - 編集モード時のドラッグ操作用。最小限の高さに設定。 */}
            {isEditing && (
                <Tooltip text={t('tooltip.drag')}>
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
                            width: '100%',
                        }}
                        onPointerDown={handleDragStart}
                        aria-label={t('tooltip.drag')}
                    >
                        ⠿
                    </div>
                </Tooltip>
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

            {/* 使い方を開くボタン（左下）
                ・通常: ホバー時のみ控えめに出る
                ・ウェルカム付箋: 常に表示＆赤くはねて「?」の存在に気づかせる */}
            {!isEditing && !isMinimized && (() => {
                const isWelcome = (selectedFile?.context?.includes('はじめての付箋') ?? (urlPath?.includes('はじめての付箋') ?? false))
                return (
                    <div
                        className="absolute bottom-ui-offset-y left-ui-offset-x z-tags pointer-events-none flex"
                        style={{ opacity: isWelcome || isHover ? 1 : 0, transition: 'opacity 0.3s ease' }}
                    >
                        <Tooltip text={t('menu.openHelp')} placement="top-left">
                            <button
                                type="button"
                                aria-label={t('menu.openHelp')}
                                onPointerDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }}
                                onClick={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const { emit } = await import('@tauri-apps/api/event');
                                    await emit('fusen:open_settings', { tab: 'help' });
                                }}
                                className={`pointer-events-auto h-[20px] w-[20px] rounded-full text-[12px] leading-none flex items-center justify-center font-bold select-none transition-colors ${
                                    isWelcome
                                        ? 'animate-bounce text-orange-500'
                                        : 'text-gray-500/60 hover:text-gray-700 hover:bg-white/70'
                                }`}
                                style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
                            >
                                ?
                            </button>
                        </Tooltip>
                    </div>
                )
            })()}

            {/* タグ表示エリア（右下、ホバー時のみ） */}
            {!isEditing && !isMinimized && (
                <div
                    className="absolute bottom-ui-offset-y right-ui-offset-x z-tags pointer-events-none flex justify-end"
                    style={{ opacity: isHover ? 1 : 0, transition: 'opacity 0.2s ease' }}
                >
                    <div className="flex items-center justify-end gap-1 pointer-events-auto">
                        {currentTags.length > 0 && (
                            <div className="flex gap-1 flex-wrap max-w-[250px] justify-end">
                                {currentTags.slice(0, 3).map((tag: string, idx: number) => {
                                    const openTagFolderLabel = t('menu.openTagFolder').replace('{tag}', tag);
                                    return (
                                        <Tooltip key={idx} text={openTagFolderLabel} placement="top-right-arrow-shifted">
                                            <button
                                                type="button"
                                                aria-label={openTagFolderLabel}
                                                onPointerDown={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                }}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleOpenTagFolder(tag);
                                                }}
                                                className="text-[10px] px-2 py-[3px] bg-gray-200/80 text-gray-700 rounded border border-gray-300/80 whitespace-nowrap font-medium shadow-sm hover:bg-emerald-100 hover:text-emerald-700 hover:border-emerald-200 transition-colors cursor-pointer"
                                            >
                                                {tag.length > 4 ? `${tag.substring(0, 4)}...` : tag}
                                            </button>
                                        </Tooltip>
                                    );
                                })}
                                {currentTags.length > 3 && (
                                    <span
                                        className="text-[10px] px-2 py-[3px] bg-gray-200/50 text-gray-500 rounded border border-gray-300/50 whitespace-nowrap font-medium"
                                    >
                                        +{currentTags.length - 3}
                                    </span>
                                )}
                            </div>
                        )}
                        {isRecipeNote && (
                            <Tooltip text="レシピを閉じる" placement="top-right-arrow-shifted">
                                <button
                                    type="button"
                                    aria-label="レシピを閉じる"
                                    onPointerDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                    }}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleReturnRecipe();
                                    }}
                                    className="h-[24px] px-2 rounded text-[12px] leading-none flex items-center justify-center gap-1 text-gray-600 bg-gray-200/70 border border-gray-300/80 shadow-sm hover:bg-orange-100 hover:text-orange-700 hover:border-orange-200 transition-colors whitespace-nowrap"
                                >
                                    ↩ レシピを閉じる
                                </button>
                            </Tooltip>
                        )}
                        {currentTags.length <= 1 && !isRecipeNote && (
                            <Tooltip text={t('menu.archive')} placement="top-right-arrow-shifted">
                                <button
                                    type="button"
                                    aria-label={t('menu.archive')}
                                    onPointerDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                    }}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleArchiveFromHoverButton();
                                    }}
                                    className="h-[24px] min-w-[24px] px-1 rounded text-[13px] leading-none flex items-center justify-center text-gray-500 bg-gray-200/70 border border-gray-300/80 shadow-sm hover:bg-emerald-100 hover:text-emerald-700 hover:border-emerald-200 transition-colors"
                                >
                                    📦
                                </button>
                            </Tooltip>
                        )}
                        <Tooltip text={t('menu.delete')} hint="Ctrl+D" placement="top-right-arrow-shifted">
                            <button
                                type="button"
                                aria-label={t('menu.delete')}
                                onPointerDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleDeleteNote();
                                }}
                                className="h-[24px] min-w-[24px] px-1 rounded text-[13px] leading-none flex items-center justify-center text-gray-500 bg-gray-200/70 border border-gray-300/80 shadow-sm hover:bg-red-100 hover:text-red-600 hover:border-red-200 transition-colors"
                            >
                                🗑
                            </button>
                        </Tooltip>
                    </div>
                </div>
            )}


            {/* 画像アノテーションモーダル */}
            {annotationTarget && (
                <ImageAnnotationModal
                    absolutePath={annotationTarget.path}
                    displayUrl={annotationTarget.url}
                    onSaved={() => {
                        setAnnotationTarget(null);
                        setImageVersion(v => v + 1);
                    }}
                    onCancel={() => setAnnotationTarget(null)}
                />
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
                            <span>🏷️</span> {t('tag.addTitle')}
                        </h3>
                        <form onSubmit={handleTagSubmit} className="flex flex-col gap-4">
                            <input
                                autoFocus
                                type="text"
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50 text-sm"
                                placeholder={t('tag.addPlaceholder')}
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
                                    {t('common.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={!tagInputValue.trim()}
                                    className="px-6 py-2 text-sm font-bold text-white bg-purple-600 rounded-lg disabled:opacity-50 hover:bg-purple-700 transition-colors shadow-md"
                                >
                                    {t('tag.addButton')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* グローバルタグ削除の確認ダイアログ */}
            <ConfirmDialog
                isOpen={!!tagToDelete}
                title={t('tag.deleteTitle')}
                message={t('tag.deleteMessage').replace('{tag}', tagToDelete ?? '')}
                onConfirm={executeTagDelete}
                onCancel={() => setTagToDelete(null)}
            />

            {/* アラームダイアログ */}
            <AlarmDialog
                isOpen={showAlarmDialog}
                existingAlarmAt={alarmAtStr}
                existingAlarmSound={alarmSoundValue}
                onConfirm={handleConfirmAlarm}
                onClear={handleClearAlarm}
                onCancel={() => setShowAlarmDialog(false)}
                t={t}
            />

            {/* 自動保存失敗トースト */}
            <SaveErrorToast
                isVisible={showSaveError}
                onDismiss={() => setShowSaveError(false)}
            />

            {/* iPhone送信トースト */}
            {toastMessage && (
                <div style={{
                    position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
                    background: 'rgba(30,30,30,0.85)', color: 'white',
                    padding: '8px 18px', borderRadius: 8, fontSize: 13,
                    pointerEvents: 'none', zIndex: 9999,
                    backdropFilter: 'blur(4px)',
                }}>
                    {toastMessage}
                </div>
            )}

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
