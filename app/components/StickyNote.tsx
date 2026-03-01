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
import MarkdownRenderer from './MarkdownRenderer';
import ConfirmDialog from './ConfirmDialog';

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



const StickyNote = memo(function StickyNote() {
    const searchParams = useSearchParams();
    // [NEW] プールモード判定と動的パス
    const isPoolParams = searchParams.get('isPool') === 'true';
    const [dynamicUrlPath, setDynamicUrlPath] = useState<string | null>(searchParams.get('path') || null);
    const [isPool, setIsPool] = useState<boolean>(isPoolParams);
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

    // UI状態
    const [isHover, setIsHover] = useState(false);
    const [isDraggableArea, setIsDraggableArea] = useState(false);
    const [shellCursor, setShellCursor] = useState('default');

    // タグモーダル
    const [showTagModal, setShowTagModal] = useState(false);
    const [tagInputValue, setTagInputValue] = useState('');
    const [tagToDelete, setTagToDelete] = useState<string | null>(null);

    // Refs
    const editorRef = useRef<RichTextEditorRef>(null);
    const editorHostRef = useRef<HTMLDivElement>(null);
    const shellRef = useRef<HTMLDivElement>(null);
    const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
    const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
    const isCapturingRef = useRef(false);
    const isPromotingRef = useRef(false); // promote中はblurによる編集モード解除を防ぐ

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
        setRawFrontmatter
    } = useNoteFile({
        path: urlPath,
        isNew,
        onPathChange: (newPath) => {
            // [ROOT FIX] リネーム後にこのコールバックが呼ばれる。
            // 必ず setDynamicUrlPath を呼んで React の urlPath state を新しいパスに更新する。
            // これを呼ばないと urlPath が古いパスのままになり、
            // リネーム後の自動保存が全部「ファイルが見つからない」エラーになる
            const ts = new Date().toLocaleTimeString('ja-JP');
            console.log(`[StickyNote | ${ts}] onPathChange called: ${urlPath} -> ${newPath}`);
            setDynamicUrlPath(newPath);

            const url = new URL(window.location.href);
            url.searchParams.set('path', newPath);
            window.history.replaceState({}, '', url.toString());

            const newContext = content.split('\n')[0].trim();
            setSelectedFile((prev) => (prev ? { ...prev, path: newPath, context: newContext } : null));
        }
    });

    // スタイル関連（カスタムフックで一元管理）
    const { noteBackgroundColor, setNoteBackgroundColor, noteFontSize } = useNoteStyles(note);

    // 削除・アーカイブ中の保存防止フラグ
    const isDeletingRef = useRef(false);
    // ウィンドウクローズ処理中フラグ（onCloseRequested 再入防止）
    const isHandlingCloseRef = useRef(false);

    // 保存処理のラッパー（削除中は保存しない）
    const handleSave = useCallback(async (body: string, front: string, allowRename: boolean) => {
        if (isDeletingRef.current) {
            console.log('[TRACE:STICKYNOTE_SAVE] Skipped because note is being deleted/archived');
            return;
        }
        if (isPool) {
            console.log(`[TRACE:STICKYNOTE_SAVE] Skipped save because window is currently a Pool. bodyPreview=${body.substring(0, 10)}...`);
            return;
        }

        console.log(`[TRACE:STICKYNOTE_SAVE] Executing saveNoteContent. isNew=${isNew}, allowRename=${allowRename}, contentLength=${body.length}`);
        await saveNoteContent(body, front, allowRename);
        if (isNew) {
            console.log(`[TRACE:STICKYNOTE_SAVE] Clearing isNew flag after save`);
            setIsNewState(false);
        }
    }, [saveNoteContent, isNew, isPool]);

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

    const { isMinimized, toggleMinimize, saveWindowState, setOriginalSize, setIsMinimized } = useWindowManager({
        onGeometryChange: (geom) => {
            if (isDeletingRef.current) return;
            // [FIX] プール状態・新規ノート昇格直後はジオメトリ変更保存をスキップする
            // ウィンドウを表示位置に移動する際にこのコールバックが呼ばれ、
            // まだファイルが確定していないパスへのauto-saveが走ってしまうのを防ぐ
            if (isPool) {
                console.log('[TRACE:STICKYNOTE] Geometry change ignored: window is still a pool');
                return;
            }
            setRawFrontmatter((prev) => updateFrontmatterGeometry(prev, geom));
            setSavePending(true);
        },
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
            invoke('fusen_set_always_on_top', { enabled: Boolean(isPinned) }).catch(err => {
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
            // invoke は useEffect で処理されるためここでは削除
            if (note) {
                // [Fix] updateFrontmatterValue は frontmatter 文字列のみを受け取る必要がある
                // 以前の実装では note.body (全文) を渡していたため、FrontMatter分離に失敗して本文が消えていた

                // 現在のrawFrontmatterを使用（なければnote.bodyから分離）
                let currentFront = rawFrontmatter;
                let currentBody = content;

                if (!currentFront) {
                    const { front, body } = splitFrontMatter(note.body);
                    currentFront = front;
                    currentBody = body;
                }

                const newFront = updateFrontmatterValue(currentFront, 'alwaysOnTop', newState.toString());

                // saveNoteContent は (body, frontmatter, allowRename) を受け取る
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
            console.log('[StickyNote] New note: skipping loadNote, starting edit mode directly');
            // initialIsEditing:true で既にisEditing=trueなので startEditing は早期リターンする
            // [FIX] Ticksを少し遅らせてDOMの描画とエディタの初期化完了後にフォーカスする
            setTimeout(() => {
                console.log('[StickyNote] Direct Start: Calling focusAndSelectFirstLine');
                editorRef.current?.focusAndSelectFirstLine();
                getCurrentWindow().setFocus().catch(() => { });
            }, 100);
        } else {
            // 既存ノート: 通常のロードフロー
            loadNote().then((body) => {
                console.log('[StickyNote] Note loaded. isNew:', isNew);
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [urlPath, isNew]);

    // イベントリスナー設定（move, resize, close）
    useEffect(() => {
        if (!selectedFile) return;

        let isMounted = true;
        let unlistenMove: (() => void) | null = null;
        let unlistenResize: (() => void) | null = null;
        let unlistenClose: (() => void) | null = null;

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

                const uClose = await win.onCloseRequested(async (event) => {
                    // 削除・アーカイブ中、または endEditing 後の再クローズ時のみ通過
                    if (isDeletingRef.current || isHandlingCloseRef.current) return;
                    // Alt+F4 等の外部クローズ要求は常にブロック（再表示手段がないため）
                    event.preventDefault();
                    if (isEditing) {
                        // 編集中は保存してから閉じる処理を行う（削除・アーカイブ操作時のみ）
                        // 通常の Alt+F4 では保存のみ行い、ウィンドウは維持する
                        isHandlingCloseRef.current = true;
                        await endEditing();
                        isHandlingCloseRef.current = false;
                    }
                    // 閲覧モード・編集モードとも: ウィンドウ維持（何もしない）
                });
                const safeClose = wrapUnlisten(uClose);
                if (isMounted) unlistenClose = safeClose; else safeClose();

            } catch (err) {
                console.warn('[StickyNote] Event listener setup failed:', err);
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
            safeUnlisten(unlistenClose);
        };
    }, [selectedFile, isEditing, endEditing, saveWindowState]);

    // [NEW] Alt+Tab表示制御: フォーカス時にRustへ通知（selectedFileに依存しない独立したuseEffect）
    useEffect(() => {
        const win = getCurrentWindow();
        console.log(`[AltTab] useEffect started. label=${win.label}`);
        let unlisten: (() => void) | null = null;

        const setup = async () => {
            try {
                // まずこのウィンドウをAlt+Tabから隠す（フォーカス前は非表示）
                await invoke('fusen_make_tool_window');
                console.log(`[AltTab] fusen_make_tool_window OK (initial hide). label=${win.label}`);

                // 既にフォーカス済みの場合は即座に表示登録
                const focused = await win.isFocused();
                console.log(`[AltTab] isFocused=${focused}, label=${win.label}`);
                if (focused) {
                    const result = await invoke('fusen_set_as_alt_tab_window', { label: win.label });
                    console.log(`[AltTab] fusen_set_as_alt_tab_window OK (initial show):`, result);
                }

                unlisten = await win.listen('tauri://focus', async () => {
                    console.log(`[AltTab] tauri://focus fired. label=${win.label}`);
                    try {
                        const result = await invoke('fusen_set_as_alt_tab_window', { label: win.label });
                        console.log(`[AltTab] fusen_set_as_alt_tab_window OK:`, result);
                    } catch (e) {
                        console.warn('[AltTab] fusen_set_as_alt_tab_window failed:', e);
                    }
                });
                console.log(`[AltTab] tauri://focus listener registered. label=${win.label}`);
            } catch (e) {
                console.warn('[AltTab] setup failed:', e);
            }
        };

        setup();

        return () => {
            console.log(`[AltTab] cleanup. label=${win.label}`);
            try {
                const p = (unlisten as any)?.();
                if (p && p.catch) p.catch(() => { });
            } catch (e) { }
        };
    }, []); // 依存なし - マウント時に一度だけ登録

    // [NEW] プールからの昇格（Promote）処理
    useEffect(() => {
        if (!isPool) return;

        console.log('[StickyNote:Pool] Waiting for promote_from_pool event...');
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
                const dbgLog = (msg: string) => {
                    console.log(msg);
                    invoke('fusen_debug_log', { message: msg }).catch(() => {});
                };
                isPromotingRef.current = true; // blur防止フラグ ON
                dbgLog(`[POOL_PROMOTE|${ts}] START label=${thisWin.label} target=(${event.payload.targetPhysX},${event.payload.targetPhysY}) size=${event.payload.targetPhysWidth}x${event.payload.targetPhysHeight}`);

                setDynamicUrlPath(event.payload.path);
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

                setIsPool(false); // プールモード解除

                // プール待機中のBlurでisEditingがfalseになっているため、明示的に編集モードを開始
                startEditing();

                // [FIX] JS の show()→setSize→setPosition は React の非同期再レンダリングによる
                // IPC タイミング問題で setSize/setPosition が例外を投げクラッシュする。
                // Rust の SetWindowPos(SWP_SHOWWINDOW) で show+サイズ(+位置)を原子的に実行する。
                // targetPhysWidth/Height は常に送られるため必ずサイズを適用できる。
                // targetPhysX/Y は undefined の場合は null を渡して SWP_NOMOVE（位置変更なし）。
                try {
                    await invoke('fusen_show_at_position', {
                        label: thisWin.label,
                        physX: event.payload.targetPhysX ?? null,
                        physY: event.payload.targetPhysY ?? null,
                        physWidth: event.payload.targetPhysWidth ?? 400,
                        physHeight: event.payload.targetPhysHeight ?? 300,
                    });
                    dbgLog(`[POOL_PROMOTE|${ts}] fusen_show_at_position OK pos=(${event.payload.targetPhysX ?? 'NOMOVE'},${event.payload.targetPhysY ?? 'NOMOVE'})`);
                } catch (e) {
                    dbgLog(`[POOL_PROMOTE|${ts}] fusen_show_at_position FAILED: ${e} – falling back to show()`);
                    await thisWin.show();
                }

                // 実際の位置を確認
                try {
                    const finalPos = await thisWin.outerPosition();
                    dbgLog(`[POOL_PROMOTE|${ts}] FINAL pos=(${finalPos.x},${finalPos.y})`);
                } catch(e) { /* ignore */ }

                // CodeMirror のレイアウトを再計算させる（hidden→visible 時に必要）
                window.dispatchEvent(new Event('resize'));

                // [FIX] Rust側でSetForegroundWindowを呼ぶため、JS側のsetFocusは不要。
                // 300ms 待つことで ITaskbarList 操作完了後に確実にフォーカスを取得する。
                setTimeout(async () => {
                    isPromotingRef.current = false; // blur防止フラグ OFF
                    // blurでisEditingがリセットされた場合に備えて強制的にedit modeをONにする
                    setIsEditing(true);
                    // Reactの再レンダリングを待ってからフォーカス
                    await new Promise(r => setTimeout(r, 80));
                    dbgLog(`[POOL_PROMOTE|${ts}] focus attempt: editorRef=${!!editorRef.current}`);
                    if (event.payload.isNew) {
                        editorRef.current?.focusAndSelectFirstLine();
                    } else {
                        editorRef.current?.focus();
                    }
                    dbgLog(`[POOL_PROMOTE|${ts}] focus+cursor applied, editorRef=${!!editorRef.current}`);
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

        let isMounted = true;
        let unlistenReload: (() => void) | null = null;

        const setupListener = async () => {
            try {
                // unlisten関数自体がPromiseを返すTauri v2仕様への対策ラッパー
                const wrapUnlisten = (u: any) => () => {
                    try {
                        const p = u?.();
                        if (p && p.catch) p.catch(() => { });
                    } catch (e) { }
                };

                const uReload = await listen<{ path: string }>('fusen:reload_note', async (event) => {
                    const targetPath = event.payload?.path;
                    if (targetPath && selectedFile?.path && pathsEqual(targetPath, selectedFile.path)) {
                        console.log('[RELOAD] Reloading note:', targetPath);
                        const body = await loadNote();
                        setContent(body);
                        setEditBody(body);

                        if (isEditing) {
                            setIsEditing(false);
                        }
                    }
                });
                const safeReload = wrapUnlisten(uReload);
                if (isMounted) unlistenReload = safeReload; else safeReload();
            } catch (err) {
                console.warn('[StickyNote] reload_note listener setup failed:', err);
            }
        };

        setupListener();

        return () => {
            isMounted = false;
            const safeUnlisten = (u: any) => {
                try {
                    const p = u?.();
                    if (p && p.catch) p.catch(() => { });
                } catch (e) { }
            };
            safeUnlisten(unlistenReload);
        };
    }, [selectedFile, isEditing, loadNote, setContent, setEditBody, setIsEditing]);

    // 全文検索スクロールイベントリスナー
    useEffect(() => {
        if (!selectedFile) return;

        let unlisten: (() => void) | undefined;

        const setupScrollToLineListener = async () => {
            try {
                // unlisten関数自体がPromiseを返すTauri v2仕様への対策ラッパー
                const wrapUnlisten = (u: any) => () => {
                    try {
                        const p = u?.();
                        if (p && p.catch) p.catch(() => { });
                    } catch (e) { }
                };

                const uScroll = await listen<{ path: string; line: number; query?: string }>(
                    'fusen:scroll_to_line',
                    async (event) => {
                        const { path: targetPath, line, query } = event.payload;

                        if (!pathsEqual(targetPath, selectedFile.path)) return;

                        if (!isEditing) {
                            startEditing();
                        }

                        await new Promise((r) => setTimeout(r, 100));

                        if (editorRef.current) {
                            const lines = content.split('\n');
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
                unlisten = wrapUnlisten(uScroll);
            } catch (err) {
                console.warn('[StickyNote] scroll_to_line listener setup failed:', err);
            }
        };

        setupScrollToLineListener();

        return () => {
            const safeUnlisten = (u: any) => {
                try {
                    const p = u?.();
                    if (p && p.catch) p.catch(() => { });
                } catch (e) { }
            };
            safeUnlisten(unlisten);
        };
    }, [selectedFile, content, isEditing, startEditing]);

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
                // Tag操作後にノートをリロードして最新の状態（タグ反映済み）を取得する
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

        console.log('[Frontend] Executing global delete for:', tagToDelete);
        try {
            const count = await deleteTagFromAllNotes(tagToDelete);
            console.log(`[Frontend] Deleted tag ${tagToDelete} from ${count} notes.`);
            if (count === 0) {
                console.warn('[Frontend] Backend reported 0 notes modified. Is the tag matching correct?');
            }

            // Tag操作後にノートをリロードして最新の状態を取得する
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
     * 編集モード終了処理（handleEditBlur）
     */
    const handleEditBlur = useCallback(async (e?: FocusEvent) => {
        // [Fix] キャプチャ中は編集モードを維持する
        if (isCapturingRef.current) {
            console.log('[Blur] Capturing in progress, skipping endEditing');
            return;
        }
        // [Fix] promote中（プールウィンドウ昇格中）はblurによる編集モード解除を防ぐ
        if (isPromotingRef.current) {
            console.log('[Blur] Promoting in progress, skipping endEditing');
            return;
        }

        // フォーカス移動先がツールバー内なら編集終了しない
        if (e && e.relatedTarget instanceof Element) {
            if (e.relatedTarget.closest('.hoverBar') || e.relatedTarget.closest('.editorHost')) {
                console.log('[Blur] Focus moved to toolbar/editor, keeping edit mode');
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
        // 代わりにエディタがフォーカスを失った(blur)タイミングで終了するようにする。
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

        // ドラッグ閾値を緩和: 距離(3px)・時間(50ms)で素早くドラッグ開始
        const startX = e.clientX;
        const startY = e.clientY;
        const startTime = Date.now();
        let hasDragged = false; // [New] ドラッグ判定フラグ

        const onPointerMove = (moveEvent: PointerEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            const elapsed = Date.now() - startTime;

            // 閾値を緩和: 5px以上動いたら、または10ms経過したらドラッグ開始 (誤検知防止のため2px -> 5pxへ変更)
            if (!hasDragged && (Math.abs(dx) > 5 || Math.abs(dy) > 5) && elapsed > 10 && moveEvent.buttons === 1) {
                hasDragged = true;
                cleanup(); // リスナー解除（Tauriに委譲するため）
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
            if (!hasDragged && isEditing) {
                console.log('[Footer] Click detected (no drag). Ending edit.');
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
            console.log('[StickyNote] Window blur event fired'); // [Debug]
            if (Date.now() < ignoreBlurUntilRef.current) {
                console.log('[StickyNote] Blur ignored due to grace period'); // [Debug]
                return;
            }
            console.log('[StickyNote] Window blurred, calling handleEditBlur'); // [Debug]
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
                // console.log('[StickyNote] Click inside editor host'); // Verbose
                return;
            }
            if ((target as HTMLElement)?.closest?.('.hoverBar')) {
                console.log('[StickyNote] Click inside hoverBar'); // [Debug]
                return;
            }

            console.log('[StickyNote] Click outside detected (onPointerDownCapture). Calling handleEditBlur.'); // [Debug]
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
                console.log('[Shortcut] Ctrl+F pressed, opening search');
                emit('fusen:open_search');
            }
            // [New] Ctrl+N: 新規付箋作成
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                console.log('[Shortcut] Ctrl+N pressed, creating new note');
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
                        invoke('fusen_debug_log', { message: `[CREATE_REQ] Ctrl+N outerPosition/scaleFactor FAILED: ${e}` }).catch(() => {});
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
                    onBold={() => editorRef.current?.insertBold()}
                    onHeading={() => editorRef.current?.insertHeading1()}
                    onList={() => editorRef.current?.insertList()}
                    onCheckbox={() => editorRef.current?.insertCheckbox()}
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
                            invoke('fusen_debug_log', { message: `[CREATE_REQ] + button outerPosition/scaleFactor FAILED: ${e}` }).catch(() => {});
                        }
                        const dbgMsg = `[CREATE_REQ] + clicked label=${win.label} sourcePhysX=${sourcePhysX} sourcePhysY=${sourcePhysY} scale=${sourceScale}`;
                        console.log(dbgMsg);
                        invoke('fusen_debug_log', { message: dbgMsg }).catch(() => {});
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
                        />
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

        </div >
    );
});

export default StickyNote;
