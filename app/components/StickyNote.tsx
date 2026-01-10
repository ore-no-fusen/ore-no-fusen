'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

// 型定義
type NoteMeta = {
    path: string;
    seq: number;
    context: string;
    updated: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    backgroundColor?: string;
    alwaysOnTop?: boolean;
};

type Note = {
    body: string;
    frontmatter: any;
    meta: NoteMeta;
};

// ユーティリティ関数
function splitFrontMatter(src: string) {
    if (!src.startsWith('---')) return { front: '', body: src };
    const end = src.indexOf('\n---', 3);
    if (end === -1) return { front: '', body: src };
    const front = src.slice(0, end + 4);
    const body = src.slice(end + 4).replace(/^\s+/, '');
    return { front, body };
}

function getFileName(path: string) {
    return path.split(/[\\/]/).pop() || path;
}

const showSaveError = () => {
    console.error('Save failed');
};

export default function StickyNote() {
    const searchParams = useSearchParams();
    const urlPath = searchParams.get('path');

    const [selectedFile, setSelectedFile] = useState<NoteMeta | null>(null);
    const [content, setContent] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editBody, setEditBody] = useState('');
    const [savePending, setSavePending] = useState(false);
    const [cursorPosition, setCursorPosition] = useState<number | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [rawFrontmatter, setRawFrontmatter] = useState<string>('');
    const [noteBackgroundColor, setNoteBackgroundColor] = useState<string>('#f7e9b0');
    // リネームによる更新かどうかを判定するフラグ
    const isRenamingRef = useRef(false);

    // ホバー管理
    const [isHover, setIsHover] = useState(false);
    const [isDraggableArea, setIsDraggableArea] = useState(false);
    const [isEditableArea, setIsEditableArea] = useState(false);
    const [isCornerArea, setIsCornerArea] = useState(false);
    const shellRef = useRef<HTMLDivElement>(null);

    // Frontmatter更新ヘルパー
    const updateFrontmatterValue = (front: string, key: string, value: string | number) => {
        // Use exact field names only - no aliases to prevent mismatches
        const regex = new RegExp(`(${key}:\\s*)(.*)`, 'm');
        if (regex.test(front)) {
            return front.replace(regex, `$1${value}`);
        } else {
            const lastFence = front.lastIndexOf('---');
            if (lastFence > 0) {
                return front.slice(0, lastFence) + `${key}: ${value}\n` + front.slice(lastFence);
            }
            if (!front || front.trim() === '') {
                return `---\n${key}: ${value}\n---\n`;
            }
            return front + `\n---\n${key}: ${value}\n---\n`;
        }
    };

    const updateFrontmatterGeometry = (front: string, geom: { x?: number, y?: number, width?: number, height?: number }) => {
        let newFront = front;
        if (geom.x !== undefined) newFront = updateFrontmatterValue(newFront, 'x', Math.round(geom.x));
        if (geom.y !== undefined) newFront = updateFrontmatterValue(newFront, 'y', Math.round(geom.y));
        if (geom.width !== undefined) newFront = updateFrontmatterValue(newFront, 'width', Math.round(geom.width));
        if (geom.height !== undefined) newFront = updateFrontmatterValue(newFront, 'height', Math.round(geom.height));
        return newFront;
    };

    // ウィンドウ状態保存
    const saveWindowState = useCallback(async () => {
        // [New Feature Instruction for Frontend Dev]
        // Use 'fusen_update_geometry' for efficient persistence without triggering full save.
        // Example: await invoke('fusen_update_geometry', { path: selectedFile.path, x, y, width, height });
        // Ensure to debounce this call (already done in useEffect).

        if (!selectedFile) return;
        try {
            const win = getCurrentWindow();
            const factor = await win.scaleFactor();
            const physPos = await win.outerPosition();
            const physSize = await win.innerSize();

            const x = Math.round(physPos.x / factor);
            const y = Math.round(physPos.y / factor);
            const width = Math.round(physSize.width / factor);
            const height = Math.round(physSize.height / factor);

            setRawFrontmatter(prev => {
                const updated = updateFrontmatterGeometry(prev, { x, y, width, height });
                console.log(`[GEOMETRY] Saved (Logical): x=${x}, y=${y}, w=${width}, h=${height} (Factor: ${factor})`);
                return updated;
            });
            setSavePending(true);
        } catch (e) {
            console.error('Failed to save window state', e);
        }
    }, [selectedFile]);
    // ノート保存
    const saveNote = useCallback(async (path: string, body: string, frontmatter: string) => {
        try {
            const newPath = await invoke<string>('fusen_save_note', { path, body, frontmatterRaw: frontmatter });
            if (newPath !== path) {
                console.log('File renamed during save:', path, '->', newPath);
                isRenamingRef.current = true; // リネームフラグを立てる
                setSelectedFile(prev => prev ? { ...prev, path: newPath } : null);
                const url = new URL(window.location.href);
                url.searchParams.set('path', newPath);
                window.history.replaceState({}, '', url.toString());
            }
        } catch (e) {
            console.error('save_note failed', e);
        }
    }, []);

    // 自動保存
    useEffect(() => {
        if (!selectedFile || !savePending) return;
        const timer = setTimeout(async () => {
            try {
                console.log('[AUTO_SAVE] Saving note:', selectedFile.path);
                await saveNote(selectedFile.path, editBody, rawFrontmatter);
                setContent(editBody);
                setSavePending(false);
            } catch (e) {
                showSaveError();
            }
        }, 800);
        return () => clearTimeout(timer);
    }, [selectedFile, rawFrontmatter, editBody, saveNote, savePending]);

    // コンテンツ読み込み
    const loadFileContent = async (noteMeta: NoteMeta) => {
        setLoading(true);
        try {
            const note = await invoke<Note>('fusen_read_note', { path: noteMeta.path });
            const { front, body } = splitFrontMatter(note.body);
            setRawFrontmatter(front);
            setContent(body);
            setEditBody(body);
            setIsEditing(false);

            const colorMatch = front.match(/backgroundColor:\s*["']?([^"'\s]+)["']?/);
            if (colorMatch) {
                setNoteBackgroundColor(colorMatch[1]);
            } else {
                setNoteBackgroundColor('#f7e9b0');
            }
        } catch (error) {
            console.error('read_note failed', error);
            setContent('');
        } finally {
            setLoading(false);
        }
    };

    // 初期ロード
    useEffect(() => {
        if (!urlPath) return;

        // リネームによるURL更新の場合は、再読み込みをスキップ
        if (isRenamingRef.current) {
            console.log('[STICKY_LOAD] Skipping reload due to rename:', urlPath);
            isRenamingRef.current = false;
            return;
        }

        console.log('[STICKY_LOAD] Detected path parameter:', urlPath);

        const myNote: NoteMeta = {
            path: urlPath,
            seq: 0,
            context: getFileName(urlPath),
            updated: '',
        };
        setSelectedFile(myNote);
        loadFileContent(myNote);
    }, [urlPath]);

    // イベントリスナー設定
    useEffect(() => {
        if (!selectedFile) return;

        let unlistenMove: (() => void) | undefined;
        let unlistenResize: (() => void) | undefined;
        let moveTimer: NodeJS.Timeout;
        let resizeTimer: NodeJS.Timeout;

        const setupListeners = async () => {
            const win = getCurrentWindow();

            unlistenMove = await win.listen('tauri://move', () => {
                clearTimeout(moveTimer);
                moveTimer = setTimeout(() => {
                    saveWindowState();
                }, 800);
            });

            unlistenResize = await win.listen('tauri://resize', () => {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(() => {
                    saveWindowState();
                }, 800);
            });
        };

        setupListeners();

        return () => {
            if (unlistenMove) unlistenMove();
            if (unlistenResize) unlistenResize();
            clearTimeout(moveTimer);
            clearTimeout(resizeTimer);
        };
    }, [selectedFile, saveWindowState]);

    // 背景色変更を確実に反映させるためのuseEffect
    useEffect(() => {
        if (shellRef.current) {
            shellRef.current.style.setProperty('background-color', noteBackgroundColor, 'important');
        }
    }, [noteBackgroundColor]);

    // 編集モード開始
    const handleEditStart = (offset?: number) => {
        setIsEditing(true);
        setCursorPosition(offset ?? null);
    };

    // 編集モード終了
    const handleEditBlur = () => {
        setIsEditing(false);
    };

    // 編集内容変更
    const handleEditChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setEditBody(e.target.value);
        setSavePending(true);
    };

    // キーボードイベント
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Escape') {
            handleEditBlur();
        }
    };

    // カーソル位置設定
    useEffect(() => {
        if (isEditing && textareaRef.current && cursorPosition !== null) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(cursorPosition, cursorPosition);
            setCursorPosition(null);
        } else if (isEditing && textareaRef.current) {
            textareaRef.current.focus();
        }
    }, [isEditing, cursorPosition]);

    // ドラッグ開始
    const handleDragStart = useCallback(async (e: React.PointerEvent) => {
        // 左クリック(0)以外はドラッグ処理しない（右クリックメニューを表示させるため）
        if (e.button !== 0) {
            return;
        }

        const target = e.target as HTMLElement;

        // タイトルバー（.file-name）のクリックは常にドラッグ許可
        // ただし、もし .file-name 内にボタン等があれば除外する必要があるが、現状はテキストのみ
        if (
            target.classList.contains('file-name')
        ) {
            // pass
        } else {
            // インタラクティブ要素上ではドラッグしない
            if (
                target.tagName === 'BUTTON' ||
                target.tagName === 'A' ||
                target.tagName === 'TEXTAREA' ||
                target.tagName === 'INPUT' ||
                target.closest('button')
            ) {
                return;
            }
            // 記事本文（テキスト部分）をクリックした場合はドラッグしない
            if (target.closest('article') || target.closest('p, h1, h2, h3, li, span, strong, em, code, pre')) {
                return;
            }
        }

        try {
            await getCurrentWindow().startDragging();
        } catch (err) {
            console.error('startDragging failed', err);
        }
    }, []);



    // ホバー管理
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
                setIsEditableArea(false);
                setIsCornerArea(false);
            } else if (isInside) {
                const target = e.target as HTMLElement;
                const textElement = target.closest('p, h1, h2, h3, li, span, strong, em, code, pre');
                const interactive = target.closest('button, textarea, input, .file-name');

                const gap = 15;
                const nearLeft = e.clientX < rect.left + gap;
                const nearRight = e.clientX > rect.right - gap;
                const nearTop = e.clientY < rect.top + gap;
                const nearBottom = e.clientY > rect.bottom - gap;
                const isCorner = (nearLeft || nearRight) && (nearTop || nearBottom);
                setIsCornerArea(isCorner);

                if (interactive) {
                    setIsDraggableArea(false);
                    setIsEditableArea(false);
                } else if (textElement) {
                    setIsDraggableArea(false);
                    setIsEditableArea(true);
                } else {
                    setIsDraggableArea(true);
                    setIsEditableArea(false);
                }
            }
        };

        const handleReset = () => {
            setIsHover(false);
            setIsDraggableArea(false);
            setIsEditableArea(false);
            setIsCornerArea(false);
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




    // Global Context Menu Listener (Right Click) with Native Menu
    useEffect(() => {
        const handleContextMenu = async (e: MouseEvent) => {
            e.preventDefault();
            if (!selectedFile) return;

            try {
                // Import menu classes
                const { Menu, MenuItem, Submenu, PredefinedMenuItem } = await import('@tauri-apps/api/menu');
                const { getCurrentWindow } = await import('@tauri-apps/api/window');

                // Filename display item (non-clickable)
                const filenameItem = await MenuItem.new({
                    id: 'ctx_filename',
                    text: `📄 ${getFileName(selectedFile.path)}`,
                    enabled: false
                });

                const separator1 = await PredefinedMenuItem.new({ item: 'Separator' });

                // Open folder item
                const openFolderItem = await MenuItem.new({
                    id: 'ctx_open_folder',
                    text: '📁 フォルダを開く',
                    action: async () => {
                        try {
                            await invoke('fusen_open_containing_folder', { path: selectedFile.path });
                        } catch (err) {
                            console.error('Failed to open folder', err);
                        }
                    }
                });

                const separator2 = await PredefinedMenuItem.new({ item: 'Separator' });

                // Build menu items
                const newNoteItem = await MenuItem.new({
                    id: 'ctx_new_note',
                    text: '📝 新規メモ',
                    action: async () => {
                        try {
                            // Get current folder from selected file path
                            const normalizedPath = selectedFile.path.replace(/\\/g, '/');
                            const folderPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));

                            // Create new note
                            const note = await invoke<Note>('fusen_create_note', {
                                folderPath,
                                context: ''
                            });

                            // Open new note window directly (no emit to avoid duplicates)
                            const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
                            const sanitizedPath = note.meta.path.replace(/[^a-zA-Z0-9]/g, '_');
                            const label = `note_${sanitizedPath}`;

                            new WebviewWindow(label, {
                                url: `/?path=${encodeURIComponent(note.meta.path)}`,
                                title: 'Sticky Note',
                                width: 400,
                                height: 300,
                                decorations: false,
                                transparent: true,
                                alwaysOnTop: false,
                                skipTaskbar: false
                            });
                        } catch (e) {
                            console.error('New note creation failed', e);
                        }
                    }
                });

                const colorBlueItem = await MenuItem.new({
                    id: 'ctx_color_blue',
                    text: '🔵 Blue',
                    action: () => {
                        const newColor = '#80d8ff';
                        setNoteBackgroundColor(newColor);
                        setRawFrontmatter(prev => updateFrontmatterValue(prev, 'backgroundColor', newColor));
                        setSavePending(true);
                        if (shellRef.current) {
                            shellRef.current.style.setProperty('background-color', newColor, 'important');
                        }
                    }
                });

                const colorPinkItem = await MenuItem.new({
                    id: 'ctx_color_pink',
                    text: '🌸 Pink',
                    action: () => {
                        const newColor = '#ffcdd2';
                        setNoteBackgroundColor(newColor);
                        setRawFrontmatter(prev => updateFrontmatterValue(prev, 'backgroundColor', newColor));
                        setSavePending(true);
                        if (shellRef.current) {
                            shellRef.current.style.setProperty('background-color', newColor, 'important');
                        }
                    }
                });

                const colorYellowItem = await MenuItem.new({
                    id: 'ctx_color_yellow',
                    text: '💛 Yellow',
                    action: () => {
                        const newColor = '#f7e9b0';  // Default gentle yellow
                        setNoteBackgroundColor(newColor);
                        setRawFrontmatter(prev => updateFrontmatterValue(prev, 'backgroundColor', newColor));
                        setSavePending(true);
                        if (shellRef.current) {
                            shellRef.current.style.setProperty('background-color', newColor, 'important');
                        }
                    }
                });

                const colorSubmenu = await Submenu.new({
                    id: 'ctx_color_submenu',
                    text: '🎨 色変更',
                    items: [colorBlueItem, colorPinkItem, colorYellowItem]
                });

                const separator3 = await PredefinedMenuItem.new({ item: 'Separator' });

                const deleteItem = await MenuItem.new({
                    id: 'ctx_delete',
                    text: '🗑️ 削除',
                    action: async () => {
                        try {
                            // Backend will close window after successful delete
                            await invoke('fusen_move_to_trash', { path: selectedFile.path });
                        } catch (err) {
                            console.error('[DELETE] Error:', err);
                        }
                    }
                });

                // Build and show menu
                const menu = await Menu.new({
                    id: 'context_menu',
                    items: [
                        filenameItem,
                        separator1,
                        openFolderItem,
                        separator2,
                        newNoteItem,
                        colorSubmenu,
                        separator3,
                        deleteItem
                    ]
                });

                await menu.popup();

            } catch (err) {
                console.error('Failed to show context menu', err);
            }
        };

        window.addEventListener('contextmenu', handleContextMenu);
        return () => {
            window.removeEventListener('contextmenu', handleContextMenu);
        };
    }, [selectedFile]);

    // コンテキストメニューアクション
    const handleToggleAlwaysOnTop = async (enabled: boolean) => {
        if (!selectedFile) return;
        try {
            await invoke('fusen_toggle_always_on_top', {
                path: selectedFile.path,
                enable: enabled
            });
            setSelectedFile(prev => prev ? { ...prev, alwaysOnTop: enabled } : null);
        } catch (e) {
            console.error('Failed to toggle always on top', e);
        }
    };

    const handleDuplicate = async () => {
        if (!selectedFile) return;
        try {
            // 現在のフォルダパスを取得
            const normalizedPath = selectedFile.path.replace(/\\/g, '/');
            const folderPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));

            // 新規ノート作成（コンテキスト継承）
            const newNote = await invoke<Note>('fusen_create_note', {
                folderPath,
                context: selectedFile.context
            });

            // 内容を現在の内容で上書き保存（メタデータ含む）
            await invoke('fusen_save_note', {
                path: newNote.meta.path,
                body: editBody,
                frontmatterRaw: rawFrontmatter
            });

            // 新しいウィンドウを開く
            await emit('fusen:open_note', { path: newNote.meta.path });
        } catch (e) {
            console.error('Duplicate failed', e);
        }
    };

    const handleOpenFolder = async () => {
        if (!selectedFile) return;
        await invoke('fusen_open_containing_folder', { path: selectedFile.path });
    };

    const handleColorChange = (newColor: string) => {
        console.log('[COLOR] Changing to:', newColor);
        setNoteBackgroundColor(newColor);
        setRawFrontmatter(prev => updateFrontmatterValue(prev, 'backgroundColor', newColor));
        setSavePending(true);
        if (shellRef.current) {
            shellRef.current.style.setProperty('background-color', newColor, 'important');
        }
    };

    // Native Context Menu Action Listener
    useEffect(() => {
        if (!selectedFile) return;

        const unlisten = (async () => {
            const win = getCurrentWindow();
            return await win.listen<any>('fusen:context-action', async (event) => {
                const { action, path } = event.payload;
                console.log('[NativeMenu] Action:', action, 'Path:', path);

                // Ignore if not for this note (though window check should suffice, double check path)
                if (path !== selectedFile.path) return;

                if (action === 'ctx_open_folder') {
                    // Rust side handles this mostly, but we can double check or do nothing
                } else if (action.startsWith('ctx_color_')) {
                    const color = action.replace('ctx_color_', '');
                    // Rust updated the file. We should update validation State or Reload
                    // Simple refresh:
                    loadFileContent(selectedFile);
                } else if (action === 'ctx_toggle_top') {
                    // Toggle current state
                    handleToggleAlwaysOnTop(!selectedFile.alwaysOnTop);
                } else if (action === 'ctx_new_note') {
                    // Reuse "New Note" logic
                    const normalizedPath = selectedFile.path.replace(/\\/g, '/');
                    const folderPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));
                    try {
                        const note = await invoke<Note>('fusen_create_note', { folderPath, context: '' });
                        await emit('fusen:open_note', { path: note.meta.path });
                    } catch (e) {
                        console.error('New note failed', e);
                    }
                } else if (action === 'ctx_duplicate') {
                    handleDuplicate();
                } else if (action === 'ctx_trash') {
                    setSavePending(false);
                    await invoke('fusen_move_to_trash', { path: selectedFile.path });
                    await getCurrentWindow().close();
                }
            });
        })();

        return () => {
            unlisten.then(f => f());
        };
    }, [selectedFile, handleDuplicate, loadFileContent, handleToggleAlwaysOnTop]);

    // Markdown挿入ヘルパー
    const insertMarkdown = (marker: string) => {
        if (!textareaRef.current) return;
        const textarea = textareaRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const before = text.substring(0, start);
        const selection = text.substring(start, end);
        const after = text.substring(end);

        const newText = `${before}${marker}${selection}${marker}${after}`;
        setEditBody(newText);
        setSavePending(true); // 即座に保存キューへ

        // カーソル位置を復元（選択範囲を維持）
        requestAnimationFrame(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(start + marker.length, end + marker.length);
            }
        });
    };

    // ホバーバー (編集モード時はツールバー)
    const HoverBar = ({ show }: { show: boolean }) => (
        <div
            className="hoverBar"
            style={{
                opacity: (show || isEditing) ? 1 : 0,
                visibility: (show || isEditing) ? 'visible' : 'hidden',
                pointerEvents: (show || isEditing) ? 'auto' : 'none',
                transition: 'opacity 0.1s ease',
                minWidth: (isDraggableArea || isEditableArea || isEditing) ? '60px' : 'auto',
                justifyContent: 'center',
                gap: '4px'
            }}
        >
            {isEditing ? (
                <>
                    <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insertMarkdown('**')}
                        className="font-bold text-red-600 hover:bg-gray-100 px-1 rounded text-sm"
                        title="太字 (赤)"
                    >
                        B
                    </button>
                </>
            ) : (
                <>
                    {!isEditing && isDraggableArea && (
                        <span className="status-indicator text-blue-500">移動可</span>
                    )}
                    {!isEditing && isEditableArea && (
                        <span className="status-indicator text-orange-600">編集可</span>
                    )}
                    {isCornerArea && (
                        <span className="status-indicator text-gray-500 font-bold bg-white/40 rounded px-1">📏サイズ連動</span>
                    )}
                </>
            )}
        </div>
    );

    if (!urlPath) {
        return <div className="p-8">No path parameter</div>;
    }

    return (
        <div
            ref={shellRef}
            className="noteShell"
            onPointerDown={handleDragStart}
            style={{ backgroundColor: noteBackgroundColor }}
        >
            <HoverBar show={isHover} />

            <main
                className="flex-1 overflow-y-auto h-full w-full notePaper"
                style={{ backgroundColor: noteBackgroundColor }}
            >
                {loading ? (
                    <div className="text-center text-gray-300 py-8 text-xs font-mono opacity-30">Loading...</div>
                ) : isEditing ? (
                    <textarea
                        className="sticky-paper-editor notePaper block w-full resize-none overflow-hidden"
                        value={editBody}
                        onChange={handleEditChange}
                        onKeyDown={handleKeyDown}
                        onBlur={handleEditBlur}
                        placeholder="内容を入力..."
                        style={{ backgroundColor: noteBackgroundColor }}
                        ref={(el) => {
                            // @ts-ignore
                            textareaRef.current = el;
                            if (el) {
                                requestAnimationFrame(() => {
                                    el.style.height = 'auto';
                                    el.style.height = el.scrollHeight + 'px';
                                });
                            }
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                    />
                ) : (
                    <article
                        className="notePaper max-w-none"
                        style={{ backgroundColor: noteBackgroundColor, whiteSpace: 'pre-wrap', cursor: 'text' }}
                        onClick={(e) => {
                            e.stopPropagation();
                            handleEditStart();
                        }}
                    >
                        {content ? (
                            <div style={{ whiteSpace: 'pre-wrap' }}>
                                {content.split('\n').map((line, i) => {
                                    if (line.trim() === '') {
                                        return <div key={i} style={{ margin: 0 }}>&nbsp;</div>;
                                    }

                                    if (line.startsWith('# ')) {
                                        return <div key={i} style={{ fontWeight: 700, fontSize: '11px', margin: 0 }}>{line.substring(2)}</div>;
                                    } else if (line.startsWith('## ')) {
                                        return <div key={i} style={{ fontWeight: 700, fontSize: '11px', margin: 0 }}>{line.substring(3)}</div>;
                                    } else if (line.startsWith('### ')) {
                                        return <div key={i} style={{ fontWeight: 700, fontSize: '11px', margin: 0 }}>{line.substring(4)}</div>;
                                    }

                                    const parts = line.split(/(\*\*[^*]+\*\*)/g);
                                    const rendered = parts.map((part, j) => {
                                        if (part.startsWith('**') && part.endsWith('**')) {
                                            return <strong key={j} style={{ color: 'red', fontWeight: 'bold' }}>{part.slice(2, -2)}</strong>;
                                        }
                                        return part;
                                    });

                                    return <div key={i} style={{ margin: 0 }}>{rendered}</div>;
                                })}

                            </div>
                        ) : (
                            <div className="text-xs opacity-20">No content (click to edit)</div>
                        )}
                    </article>
                )}
            </main>
        </div>
    );
}
