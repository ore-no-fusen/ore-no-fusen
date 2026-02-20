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
    const urlPath = searchParams.get('path');
    const isNew = searchParams.get('isNew') === '1';

    const [selectedFile, setSelectedFile] = useState<NoteMeta | null>(null);

    // 設定・i18n
    // 設定・i18n
    const { settings } = useSettings();
    const language = (settings.language as Language) || 'ja';
    const t = useMemo(
        () => getTranslation(language),
        [language]
    );

    // スタイル関連
    const [noteBackgroundColor, setNoteBackgroundColor] = useState<string>('#f7e9b0');
    const [noteFontSize, setNoteFontSize] = useState<number>(16);
    const [isNewNote, setIsNewNote] = useState(false);

    // UI状態
    const [isHover, setIsHover] = useState(false);
    const [isDraggableArea, setIsDraggableArea] = useState(false);
    const [shellCursor, setShellCursor] = useState('default');

    // タグモーダル
    const [showTagModal, setShowTagModal] = useState(false);
    const [tagInputValue, setTagInputValue] = useState('');
    const [isTagDeleteMode, setIsTagDeleteMode] = useState(false);
    const [tagToDelete, setTagToDelete] = useState<string | null>(null);

    // Refs
    const editorRef = useRef<RichTextEditorRef>(null);
    const editorHostRef = useRef<HTMLDivElement>(null);
    const shellRef = useRef<HTMLDivElement>(null);
    const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
    const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
    const shouldReopenMenu = useRef(false);
    const isCapturingRef = useRef(false);

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
            const url = new URL(window.location.href);
            url.searchParams.set('path', newPath);
            window.history.replaceState({}, '', url.toString());

            const newContext = content.split('\n')[0].trim();
            setSelectedFile((prev) => (prev ? { ...prev, path: newPath, context: newContext } : null));
        }
    });

    // 削除・アーカイブ中の保存防止フラグ
    const isDeletingRef = useRef(false);

    // 保存処理のラッパー（削除中は保存しない）
    const handleSave = useCallback(async (body: string, front: string, allowRename: boolean) => {
        if (isDeletingRef.current) {
            console.log('[Save] Skipped because note is being deleted/archived');
            return;
        }
        await saveNoteContent(body, front, allowRename);
    }, [saveNoteContent]);

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
        lastEditEndedAt
    } = useEditMode({
        initialContent: content,
        onSave: handleSave, // ラップした保存関数を使用
        rawFrontmatter,
        isCapturing: isCapturingRef.current
    });

    // ウィンドウ管理
    const [isPinned, setIsPinned] = useState(false); // [New]
    const { isMinimized, toggleMinimize, saveWindowState, setOriginalSize, setIsMinimized } = useWindowManager({
        onGeometryChange: (geom) => {
            if (isDeletingRef.current) return;
            setRawFrontmatter((prev) => updateFrontmatterGeometry(prev, geom));
            setSavePending(true);
        }
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

        // Background Color
        if (note.meta.background_color) {
            setNoteBackgroundColor(note.meta.background_color);
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
        invoke('fusen_set_always_on_top', { enabled: isPinned });
    }, [isPinned]);

    /**
     * Pin Toggle Handler
     */
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

    // フォントサイズ同期
    useEffect(() => {
        setNoteFontSize(settings.font_size);
    }, [settings.font_size]);

    // グローバル設定更新リスナー
    useEffect(() => {
        let unlisten: (() => void) | undefined;
        (async () => {
            try {
                unlisten = await listen<any>('settings_updated', (event) => {
                    const newSettings = event.payload;
                    if (newSettings && typeof newSettings.font_size === 'number') {
                        setNoteFontSize(newSettings.font_size);
                    }
                });
            } catch (e) {
                console.error('Failed to setup settings_updated listener', e);
            }
        })();
        return () => {
            if (unlisten) unlisten();
        };
    }, []);

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

        loadNote().then((body) => {
            // [Optimized] 背景色は note.meta から取得するため、ここでの正規表現パースは削除
            // これによりレンダリングブロックを回避し、表示速度を向上

            console.log('[StickyNote] Note loaded. isNew:', isNew); // [Debug]

            // 新規ノートの場合は即座に編集モード開始（最速で書き込める）
            if (isNew) {
                console.log('[StickyNote] isNew is true. Calling startEditing()'); // [Debug]
                startEditing();
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [urlPath, isNew]);

    // イベントリスナー設定（move, resize, close）
    useEffect(() => {
        if (!selectedFile) return;

        let unlistenMove: (() => void) | undefined;
        let unlistenResize: (() => void) | undefined;
        let unlistenClose: (() => void) | undefined;

        const setupListeners = async () => {
            const win = getCurrentWindow();

            unlistenMove = await win.listen('tauri://move', () => {
                saveWindowState();
            });

            unlistenResize = await win.listen('tauri://resize', () => {
                saveWindowState();
            });

            unlistenClose = await win.listen('tauri://close-requested', async () => {
                if (isDeletingRef.current) return; // 削除中はクローズ処理を阻害しない
                if (isEditing) {
                    await endEditing();
                }
            });
        };

        setupListeners();

        return () => {
            if (unlistenMove) unlistenMove();
            if (unlistenResize) unlistenResize();
            if (unlistenClose) unlistenClose();
        };
    }, [selectedFile, isEditing, endEditing, saveWindowState]);

    // リロードイベントリスナー
    useEffect(() => {
        if (!selectedFile) return;

        let unlisten: (() => void) | undefined;

        const setupListener = async () => {
            unlisten = await listen<{ path: string }>('fusen:reload_note', async (event) => {
                const targetPath = event.payload.path;
                if (pathsEqual(targetPath, selectedFile.path)) {
                    console.log('[RELOAD] Reloading note:', targetPath);
                    const body = await loadNote();
                    setContent(body);
                    setEditBody(body);

                    if (isEditing) {
                        setIsEditing(false);
                    }
                }
            });
        };

        setupListener();

        return () => {
            if (unlisten) unlisten();
        };
    }, [selectedFile, isEditing, loadNote, setContent, setEditBody, setIsEditing]);

    // 全文検索スクロールイベントリスナー
    useEffect(() => {
        if (!selectedFile) return;

        let unlisten: (() => void) | undefined;

        const setupScrollToLineListener = async () => {
            unlisten = await listen<{ path: string; line: number; query?: string }>(
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
        };

        setupScrollToLineListener();

        return () => {
            if (unlisten) unlisten();
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
     * 編集モード終了処理（handleEditBlur）
     */
    const handleEditBlur = useCallback(async (e?: FocusEvent) => {
        // [Fix] キャプチャ中は編集モードを維持する
        if (isCapturingRef.current) {
            console.log('[Blur] Capturing in progress, skipping endEditing');
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
            // ドラッグせずにクリックだけで終わった場合、編集エリア外をクリックしたとみなして編集終了
            if (!hasDragged) {
                console.log('[Footer] Click detected (no drag). Ending edit.');
                handleEditBlur();
            }
        };
        const cleanup = () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
        };

        e.preventDefault();
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
        }
    });

    /**
     * Ctrl+F 全文検索ショートカット
     */
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                console.log('[Shortcut] Ctrl+F pressed, opening search');
                emit('fusen:open_search');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // ============================================================
    // レンダリング
    // ============================================================
    if (!urlPath) {
        return <div className="p-8">No path parameter</div>;
    }



    return (
        <div
            ref={shellRef}
            className="noteShell h-screen overflow-hidden flex flex-col"
            style={{ backgroundColor: noteBackgroundColor, cursor: shellCursor }}
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
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    zIndex: 100
                }}
            >
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
                />
            </div>

            {/* メインコンテンツ */}
            <main
                style={{
                    flex: isEditing ? 9 : 1,    // 変更: 編集時は9、表示時は1（全画面）
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'auto',
                    padding: '4px',
                    position: 'relative' // Add relative positioning for tags
                }}
                onDoubleClick={(e) => {
                    // コンテンツ外（余白）のクリック時は末尾から編集開始
                    console.log('[DEBUG] Main onDoubleClick fired. isEditing:', isEditing, 'isMinimized:', isMinimized);
                    if (!isEditing && !isMinimized) {
                        e.preventDefault();
                        startEditing(content.length);
                    }
                }}
            >
                {isMinimized ? (
                    // ミニマイズモード
                    <div
                        style={{
                            padding: '4px 6px',
                            fontSize: `${noteFontSize}px`,
                            lineHeight: '1.4',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            cursor: 'pointer',
                            userSelect: 'none',
                            color: '#000000'
                        }}
                        onClick={() => toggleMinimize()}
                        title="クリックで展開"
                    >
                        {content?.split('\n')[0]?.replace(/^#\s*/, '') || '（空のメモ）'}
                    </div>
                ) : loading ? (
                    <div className="text-center text-gray-300 py-8 text-xs font-mono opacity-30">
                        Loading...
                    </div>
                ) : isEditing ? (
                    // 編集モード
                    <div
                        className="editorHost notePaper"
                        ref={editorHostRef}
                        style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            cursor: 'text',
                            // 編集エリアの視覚化
                            backgroundColor: 'rgba(255, 255, 255, 0.5)',
                            borderRadius: '4px',
                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)',
                            margin: '0 4px 4px 4px' // 少し内側に配置
                        }}
                        onClick={(e) => {
                            // 余白クリックでエディタにフォーカスし、末尾にカーソル移動
                            if (e.target === editorHostRef.current) {
                                editorRef.current?.setCursorToEnd();
                            }
                        }}
                    >
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
                            console.log('[DEBUG] MarkdownRenderer onDoubleClick fired.');
                            e.stopPropagation();
                            // クリック位置の文字オフセットを取得
                            const target = e.target as HTMLElement;
                            const srcStart = target.closest('[data-src-start]')?.getAttribute('data-src-start');
                            const offset = srcStart ? parseInt(srcStart, 10) : 0;
                            startEditing(isNaN(offset) ? 0 : offset);
                        }}
                        selectedFilePath={selectedFile?.path}
                        resolvePath={resolvePath}
                    />
                )}
            </main>

            {/* フッター領域（ドラッグ＆確認用、全体の約1割） - 編集モード時のみ表示 */}
            {isEditing && (
                <div
                    className="noteFooter"
                    style={{
                        flex: 1, // 全体の1割
                        minHeight: '20px',
                        cursor: 'grab',
                        userSelect: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        // 見た目は変えないという要望なので透明（背景色継承）
                        backgroundColor: 'transparent'
                    }}
                    onPointerDown={handleDragStart}
                    title="ドラッグで移動"
                />
            )}


            {/* タグ表示エリア（右下、ホバー時のみ） */}
            {!isEditing && !isMinimized && currentTags.length > 0 && (
                <div style={{
                    position: 'absolute',
                    bottom: '12px',
                    right: '8px',
                    zIndex: 100,
                    pointerEvents: 'none',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    opacity: isHover ? 1 : 0,
                    transition: 'opacity 0.2s ease',
                }}>
                    <div style={{
                        display: 'flex',
                        gap: '4px',
                        flexWrap: 'wrap',
                        maxWidth: '250px',
                        justifyContent: 'flex-end',
                    }}>
                        {currentTags.slice(0, 3).map((tag: string, idx: number) => (
                            <span
                                key={idx}
                                style={{
                                    fontSize: '10px',
                                    padding: '3px 8px',
                                    backgroundColor: 'rgba(100, 100, 100, 0.08)',
                                    color: '#6b7280',
                                    borderRadius: '4px',
                                    border: '1px solid rgba(100, 100, 100, 0.15)',
                                    whiteSpace: 'nowrap',
                                    fontWeight: 500,
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                }}
                            >
                                {tag.length > 4 ? `${tag.substring(0, 4)}...` : tag}
                            </span>
                        ))}
                        {currentTags.length > 3 && (
                            <span
                                style={{
                                    fontSize: '10px',
                                    padding: '3px 8px',
                                    backgroundColor: 'rgba(100, 100, 100, 0.05)',
                                    color: '#9ca3af',
                                    borderRadius: '4px',
                                    border: '1px solid rgba(100, 100, 100, 0.1)',
                                    whiteSpace: 'nowrap',
                                    fontWeight: 500,
                                }}
                            >
                                +{currentTags.length - 3}
                            </span>
                        )}
                    </div>
                </div>
            )}

        </div >
    );
});

export default StickyNote;
