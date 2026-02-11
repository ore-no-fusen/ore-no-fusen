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
import { open } from '@tauri-apps/plugin-shell';

// カスタムHook
import { useNoteFile } from '@/app/hooks/useNoteFile';
import { useEditMode } from '@/app/hooks/useEditMode';
import { useWindowManager } from '@/app/hooks/useWindowManager';
import { useTagManager } from '@/app/hooks/useTagManager';
import { useScreenCapture } from '@/app/hooks/useScreenCapture';

// UIコンポーネント
import RichTextEditor, { RichTextEditorRef } from './RichTextEditor';
import ToolbarButtons from './ToolbarButtons';
import MarkdownRenderer from './MarkdownRenderer';
import ConfirmDialog from './ConfirmDialog';

// ユーティリティ
import { pathsEqual } from '../utils/pathUtils';
import { playDeleteSound, playSaveSound } from '../utils/soundManager';
import { splitFrontMatter, updateFrontmatterValue, removeFrontmatterKey } from '../utils/splitFrontMatter';
import { resolvePath } from '../utils/markdownUtils';

// API
import { NoteMeta } from '@/app/api/notes';
import { invoke } from '@tauri-apps/api/core';

// 設定・国際化
import { useSettings } from "@/lib/settings-store";
import { getTranslation, type Language } from "@/lib/i18n";

/**
 * ファイル名を取得する
 */
function getFileName(path: string) {
    return path.split(/[\\/]/).pop() || path;
}

/**
 * フロントマターのgeometry情報を更新する
 */
const updateFrontmatterGeometry = (
    front: string,
    geom: { x?: number; y?: number; width?: number; height?: number }
) => {
    let newFront = front;

    if (
        geom.x !== undefined &&
        geom.y !== undefined &&
        geom.width !== undefined &&
        geom.height !== undefined
    ) {
        const val = `{ x: ${Math.round(geom.x)}, y: ${Math.round(geom.y)}, width: ${Math.round(geom.width)}, height: ${Math.round(geom.height)} }`;
        newFront = updateFrontmatterValue(newFront, 'window', val);

        // レガシーフィールドのクリーンアップ
        newFront = removeFrontmatterKey(newFront, 'rect');
        newFront = removeFrontmatterKey(newFront, 'x');
        newFront = removeFrontmatterKey(newFront, 'y');
        newFront = removeFrontmatterKey(newFront, 'width');
        newFront = removeFrontmatterKey(newFront, 'height');
        newFront = removeFrontmatterKey(newFront, 'fontFamily');
        newFront = removeFrontmatterKey(newFront, 'fontSize');
        newFront = removeFrontmatterKey(newFront, 'lineHeight');
        newFront = removeFrontmatterKey(newFront, 'context');
    }

    return newFront;
};

/**
 * インラインスタイル（太字）をパースする
 */
const parseInlineStyles = (text: string, baseOffset: number) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    let currentOffset = 0;

    return (
        <>
            {parts.map((part, k) => {
                if (part === '') return null;

                const partStart = baseOffset + currentOffset;
                currentOffset += part.length;

                if (part.startsWith('**') && part.endsWith('**')) {
                    const innerText = part.slice(2, -2);
                    return (
                        <strong
                            key={k}
                            style={{ color: 'red', fontWeight: 'bold' }}
                            data-src-start={partStart + 2}
                        >
                            {innerText}
                        </strong>
                    );
                }
                return (
                    <span key={k} data-src-start={partStart}>
                        {part}
                    </span>
                );
            })}
        </>
    );
};

/**
 * リンクをパースする
 */
const parseLinks = (text: string, baseOffset: number) => {
    const regex = /((?:https?:\/\/[^\s]+)|(?:[a-zA-Z]:\\[^:<>"\/?*|\r\n]+)|(?:\\\\[^:<>"\/?*|\r\n]+))/g;
    const parts = text.split(regex);
    let currentOffset = 0;

    return (
        <>
            {parts.map((part, k) => {
                if (part === '') return null;

                const partStart = baseOffset + currentOffset;
                currentOffset += part.length;

                // regexの状態をリセットするため、新しくマッチ判定
                const isLink = /^(?:https?:\/\/[^\s]+)|^(?:[a-zA-Z]:\\[^:<>"\/?*|\r\n]+)|^(?:\\\\[^:<>"\/?*|\r\n]+)$/.test(part);
                if (isLink) {
                    return (
                        <span
                            key={k}
                            style={{
                                color: 'blue',
                                textDecoration: 'underline',
                                cursor: 'pointer'
                            }}
                            data-src-start={partStart}
                            data-tauri-drag-region="false"
                            onClick={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log('[OpenLink]', part);
                                try {
                                    if (/^https?:\/\//i.test(part)) {
                                        await open(part);
                                    } else {
                                        await invoke('fusen_open_file', { path: part });
                                    }
                                } catch (err) {
                                    console.error('Failed to open link:', err);
                                }
                            }}
                        >
                            {part}
                        </span>
                    );
                }

                return <React.Fragment key={k}>{parseInlineStyles(part, partStart)}</React.Fragment>;
            })}
        </>
    );
};

const StickyNote = memo(function StickyNote() {
    const searchParams = useSearchParams();
    const urlPath = searchParams.get('path');
    const isNew = searchParams.get('isNew') === '1';

    const [selectedFile, setSelectedFile] = useState<NoteMeta | null>(null);

    // 設定・i18n
    const { settings } = useSettings();
    const t = useMemo(
        () => getTranslation((settings.language as Language) || 'ja'),
        [settings.language]
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
    const lastContextMenuPos = useRef<{ x: number; y: number } | null>(null);
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
    const { isMinimized, toggleMinimize, saveWindowState } = useWindowManager({
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

    // タグ情報の同期
    useEffect(() => {
        if (note?.meta?.tags) {
            setCurrentTags(note.meta.tags);
        }
    }, [note, setCurrentTags]);

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

    // 初期ロード
    useEffect(() => {
        if (!urlPath) return;

        const myNote: NoteMeta = {
            path: urlPath,
            seq: 0,
            context: getFileName(urlPath),
            updated: ''
        };

        setSelectedFile(myNote);
        setIsNewNote(isNew);

        loadNote().then((body) => {
            // フロントマターから背景色を取得
            const colorMatch = rawFrontmatter.match(/backgroundColor:\s*["']?([^"'\s]+)["']?/);
            if (colorMatch) {
                setNoteBackgroundColor(colorMatch[1]);
            }

            // 新規ノートの場合は編集モード開始
            if (isNew && body === '') {
                startEditing();
            }
        });
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
    const handleEditBlur = useCallback(async () => {
        await endEditing();
    }, [endEditing]);

    /**
     * ドラッグ開始処理
     */
    const handleDragStart = useCallback(async (e: React.PointerEvent) => {
        // 左クリック(0)以外はドラッグ処理しない
        if (e.button !== 0) return;

        // 編集モード中なら、ドラッグさせずに編集終了処理を行う
        if (isEditing) {
            e.preventDefault();
            e.stopPropagation();
            handleEditBlur();
            return;
        }

        // 編集終了直後(500ms)はガード（再編集入り防止）
        if (Date.now() - lastEditEndedAt.current < 500) {
            return;
        }

        const target = e.target as HTMLElement;
        const isInteractive = !!target.closest('button, textarea, input, [data-interactable="true"]');

        // チェックボックスやボタンなど「操作が必要なパーツ」以外は、どこでもドラッグを許可する
        if (isInteractive) {
            return;
        }

        // ドラッグ閾値を緩和: 距離(3px)・時間(50ms)で素早くドラッグ開始
        const startX = e.clientX;
        const startY = e.clientY;
        const startTime = Date.now();

        const onPointerMove = (moveEvent: PointerEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            const elapsed = Date.now() - startTime;

            // 閾値を緩和: 2px以上動いたら、または10ms経過したらドラッグ開始
            if ((Math.abs(dx) > 2 || Math.abs(dy) > 2) && elapsed > 10 && moveEvent.buttons === 1) {
                cleanup();
                try {
                    getCurrentWindow().startDragging();
                } catch (err) {
                    console.error('startDragging failed', err);
                }
            }
        };

        const onPointerUp = () => cleanup();
        const cleanup = () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
        };

        e.preventDefault();
        e.stopPropagation();
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
    }, [isEditing, handleEditBlur]);

    /**
     * ウィンドウブラー時の編集終了
     */
    useEffect(() => {
        if (!isEditing) return;

        const onWindowBlur = () => {
            if (Date.now() < ignoreBlurUntilRef.current) {
                console.log('[Blur] Ignored due to grace period');
                return;
            }
            console.log('[Blur] Window blurred, ending edit');
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

            if (editorHostRef.current?.contains(target)) return;
            if ((target as HTMLElement)?.closest?.('.hoverBar')) return;

            console.log('[Boundary] Click outside detected. Ending edit.');
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
                setIsHover(false);
                setIsDraggableArea(false);
            } else if (isInside) {
                setIsHover(true);
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
     * コンテキストメニュー処理
     */

    // フォルダを開く
    const handleOpenFolder = useCallback(async () => {
        if (!selectedFile) return;
        await invoke('fusen_open_containing_folder', { path: selectedFile.path });
    }, [selectedFile]);

    // 背景色変更
    const handleColorChange = useCallback((newColor: string) => {
        console.log('[COLOR] Changing to:', newColor);
        setNoteBackgroundColor(newColor);
        updateFrontmatter('backgroundColor', newColor);
        if (shellRef.current) {
            shellRef.current.style.setProperty('background-color', newColor, 'important');
        }
    }, [updateFrontmatter]);

    /**
     * コンテキストメニュー表示
     */
    const showContextMenu = useCallback(async (x: number, y: number) => {
        try {
            const { Menu, MenuItem, PredefinedMenuItem, Submenu } = await import('@tauri-apps/api/menu');
            const { LogicalPosition } = await import('@tauri-apps/api/dpi');

            // ファイル名アイテム
            const filenameItem = await MenuItem.new({
                id: 'ctx_filename',
                text: `📄 ${selectedFile?.path ? selectedFile.path.split(/[/\\]/).pop() : 'Untitled'} (${selectedFile?.seq || '-'})`,
                enabled: false
            });

            const separator1 = await PredefinedMenuItem.new({ item: 'Separator' });

            // フォルダを開く
            const openFolderItem = await MenuItem.new({
                id: 'ctx_open_folder',
                text: `📂 ${t('menu.openFolder')}`,
                action: handleOpenFolder
            });

            // 新規メモ作成
            const newNoteItem = await MenuItem.new({
                id: 'ctx_new_note',
                text: `✨ ${t('menu.newNote')}`,
                action: async () => {
                    try {
                        if (!selectedFile) return;
                        const { emit } = await import('@tauri-apps/api/event');
                        const normalizedPath = selectedFile.path.replace(/\\/g, '/');
                        const folderPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));
                        console.log('[StickyNote] Requesting new note creation via emit');
                        await emit('fusen:request_create', { folderPath, context: 'memo' });
                    } catch (e) {
                        console.error('New note request error', e);
                    }
                }
            });

            // 色変更サブメニュー
            const colorItems = [
                await MenuItem.new({ id: 'ctx_color_blue', text: `🔵 ${t('menu.colors.blue')}`, action: () => handleColorChange('#80d8ff') }),
                await MenuItem.new({ id: 'ctx_color_pink', text: `🌸 ${t('menu.colors.pink')}`, action: () => handleColorChange('#ffcdd2') }),
                await MenuItem.new({ id: 'ctx_color_yellow', text: `💛 ${t('menu.colors.yellow')}`, action: () => handleColorChange('#f7e9b0') })
            ];
            const colorSubmenu = await Submenu.new({ id: 'ctx_color_submenu', text: `🎨 ${t('menu.changeColor')}`, items: colorItems });

            const separatorCommon = await PredefinedMenuItem.new({ item: 'Separator' });

            // メニュー項目の構築
            let menuItems: any[] = [
                filenameItem,
                separator1,
                openFolderItem,
                await PredefinedMenuItem.new({ item: 'Separator' }),
                newNoteItem,
                colorSubmenu,
                separatorCommon
            ];

            // タグ関連 (簡易実装: モード切替なしの基本タグ追加のみまず実装)
            // TODO: Delete Modeなどは後日完全復元を検討

            // タグサブメニュー (Normal Mode)
            const tagNewItem = await MenuItem.new({
                id: 'ctx_tag_new',
                text: `➕ ${t('menu.addTag')}`,
                action: async () => {
                    try {
                        const tags = await invoke<string[]>('fusen_get_all_tags');
                        loadAllTags(); // Refresh hook state
                        setShowTagModal(true);
                        setTagInputValue('');
                    } catch (e) { console.error('Failed to load tags for new tag modal:', e); }
                }
            });

            let tagSubItems: any[] = [tagNewItem];

            // 既存タグのトグル
            if (allTags.length > 0) {
                tagSubItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
                for (const tag of allTags) {
                    const isChecked = currentTags.includes(tag);
                    tagSubItems.push(await MenuItem.new({
                        id: `ctx_tag_${tag}`,
                        text: isChecked ? `☑ ${tag}` : `☐ ${tag}`,
                        action: async () => {
                            if (!selectedFile) return;
                            if (isChecked) await removeTagFromNote(selectedFile.path, tag);
                            else await addTagToNote(selectedFile.path, tag);
                        }
                    }));
                }
            }

            const tagSubmenu = await Submenu.new({ id: 'ctx_tags_submenu', text: `🏷️ ${t('menu.tags')}`, items: tagSubItems });
            menuItems.push(tagSubmenu);

            // アーカイブ
            menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
            menuItems.push(await MenuItem.new({
                id: 'ctx_archive',
                text: `📦 ${t('menu.archive')}`,
                action: async () => {
                    try {
                        if (!selectedFile) return;

                        // 保存処理をブロック
                        isDeletingRef.current = true;

                        await saveNoteContent(editBody, rawFrontmatter, false);
                        await playSaveSound();
                        await invoke('fusen_archive_note', { path: selectedFile.path });

                        // Backend closes, but ensure frontend close with permission
                        const win = (await import('@tauri-apps/api/window')).getCurrentWindow();
                        await win.hide(); // まず隠す
                        await win.close();
                    } catch (e) {
                        isDeletingRef.current = false;
                        console.error('Failed to archive note:', e);
                        alert(`${t('menu.archive_failed')}\n${e}`);
                    }
                }
            }));

            // 削除
            menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
            menuItems.push(await MenuItem.new({
                id: 'ctx_delete',
                text: `🗑️ ${t('menu.delete')}`,
                action: async () => {
                    try {
                        if (!selectedFile) return;

                        // 保存処理をブロック
                        isDeletingRef.current = true;

                        await playDeleteSound();
                        console.log('[Delete] invoking fusen_move_to_trash');
                        await invoke('fusen_move_to_trash', { path: selectedFile.path });
                        console.log('[Delete] Success from backend');

                        // Backend closes window, but we explicitly close it here to ensure UI update
                        const win = (await import('@tauri-apps/api/window')).getCurrentWindow();
                        console.log('[Delete] Hiding and Closing window...');
                        await win.hide(); // まず隠す
                        await win.close();
                        console.log('[Delete] Close requested');
                    } catch (e) {
                        isDeletingRef.current = false;
                        console.error('Failed to delete note:', e);
                        alert(`${t('menu.delete_failed')}\n${e}`);
                    }
                }
            }));


            const menu = await Menu.new({ id: 'context_menu', items: menuItems });
            await menu.popup(new LogicalPosition(x, y));

        } catch (e) {
            console.error('Failed to show context menu', e);
        }
    }, [selectedFile, t, allTags, currentTags, editBody, rawFrontmatter, saveNoteContent, loadAllTags, removeTagFromNote, addTagToNote]);

    useEffect(() => {
        const handleContextMenu = async (e: MouseEvent) => {
            e.preventDefault();
            if (isEditing) {
                await handleEditBlur();
            }
            lastContextMenuPos.current = { x: e.clientX, y: e.clientY };
            await showContextMenu(e.clientX, e.clientY);
            console.log('[ContextMenu] Right click detected');
        };

        window.addEventListener('contextmenu', handleContextMenu);
        return () => window.removeEventListener('contextmenu', handleContextMenu);
    }, [isEditing, handleEditBlur, showContextMenu]);

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
                onPointerEnter={() => setIsHover(true)}
                onPointerLeave={() => setIsHover(false)}
            >
                <ToolbarButtons
                    isEditing={isEditing}
                    isMinimized={isMinimized}
                    show={isHover}
                    onBold={() => editorRef.current?.insertBold()}
                    onHeading={() => editorRef.current?.insertHeading1()}
                    onList={() => editorRef.current?.insertList()}
                    onCheckbox={() => editorRef.current?.insertCheckbox()}
                    onCapture={async () => {
                        isCapturingRef.current = true;
                        await captureScreen();
                        isCapturingRef.current = false;
                    }}
                    onToggleMinimize={toggleMinimize}
                    onNew={async () => {
                        try {
                            if (!selectedFile) return;
                            const { emit } = await import('@tauri-apps/api/event');
                            const normalizedPath = selectedFile.path.replace(/\\/g, '/');
                            const folderPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));
                            console.log('[StickyNote] Requesting new note creation via emit');
                            await emit('fusen:request_create', { folderPath, context: 'memo' });
                        } catch (e) {
                            console.error('New note request error', e);
                        }
                    }}
                />
            </div>

            {/* メインコンテンツ */}
            <main
                style={{
                    flex: 1,
                    overflow: 'auto',
                    padding: '24px 16px 16px',
                    position: 'relative' // Add relative positioning for tags
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
                            cursor: 'text'
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
                            }}
                            backgroundColor={noteBackgroundColor}
                            cursorPosition={cursorPosition}
                            isNewNote={isNewNote}
                            fontSize={noteFontSize}
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
                            startEditing(0);
                        }}
                        onPointerDown={handleDragStart}
                        selectedFilePath={selectedFile?.path}
                        resolvePath={resolvePath}
                        parseLinks={parseLinks}
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
            </main>
        </div>
    );
});

export default StickyNote;
