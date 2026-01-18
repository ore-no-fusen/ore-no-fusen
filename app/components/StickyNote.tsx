'use client';

import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useSearchParams } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import RichTextEditor, { RichTextEditorRef } from './RichTextEditor';
import ConfirmDialog from './ConfirmDialog';

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

const StickyNote = memo(function StickyNote() {
    const searchParams = useSearchParams();
    const urlPath = searchParams.get('path');
    const isNew = searchParams.get('isNew') === '1'; // Fix 2: Define isNew outside useEffect

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
    // [Strict Rename] コミット（編集終了）処理中ガード
    const isCommittingRef = useRef(false);

    // [New] ドラッグ開始制限用のタイマー
    const lastEditEndedAt = useRef<number>(0);
    // [New] 初期ロードやフォーカス揺れによる誤Blurを防ぐタイマー
    const ignoreBlurUntilRef = useRef<number>(0);
    const editorRef = useRef<RichTextEditorRef>(null);
    const editorHostRef = useRef<HTMLDivElement>(null); // [New boundary ref]
    const editBodyRef = useRef(editBody); // [New] Stale closure fix

    // Sync ref with state for event handlers
    useEffect(() => {
        editBodyRef.current = editBody;
    }, [editBody]);

    // ホバー管理
    const [isHover, setIsHover] = useState(false);
    const [isDraggableArea, setIsDraggableArea] = useState(false);
    const [isEditableArea, setIsEditableArea] = useState(false);
    const [isCornerArea, setIsCornerArea] = useState(false);
    const [showTagModal, setShowTagModal] = useState(false);
    const [tagInputValue, setTagInputValue] = useState('');
    const [allTags, setAllTags] = useState<string[]>([]);
    const [currentTags, setCurrentTags] = useState<string[]>([]);
    const [isTagDeleteMode, setIsTagDeleteMode] = useState(false);
    const [tagToDelete, setTagToDelete] = useState<string | null>(null);
    const shellRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<any>(null); // Keep menu alive to prevent GC of callbacks

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
    const saveNote = useCallback(async (path: string, body: string, frontmatter: string, allowRename: boolean) => {
        // [Strict Log]
        console.log('[SAVE]', { allowRename, firstLine: body.split('\n')[0], path });
        console.log('[DEBUG] saveNote called:', { path, bodyLength: body.length, allowRename });
        try {
            const newPath = await invoke<string>('fusen_save_note', {
                path,
                body,
                frontmatterRaw: frontmatter,
                allowRename
            });
            console.log('[DEBUG] saveNote result:', { old: path, new: newPath, renamed: newPath !== path });
            if (newPath !== path) {
                console.log('File renamed during save:', path, '->', newPath);
                isRenamingRef.current = true; // リネームフラグを立てる

                // [Fix] Update Context and Path in State so UI reflects new title immediately
                const newContext = body.split('\n')[0].trim();
                setSelectedFile(prev => prev ? { ...prev, path: newPath, context: newContext } : null);

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
                // allowRename: false for auto-save
                await saveNote(selectedFile.path, editBody, rawFrontmatter, false);
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

        // 読み込みと初期フォーカス設定
        loadFileContent(myNote).then(async () => {
            // Fix 2: Use captured isNew
            if (isNew) {
                console.log('[STICKY_LOAD] New note detected. Enabling edit mode.');
                // 3) 新規作成時はしばらく Blur を無視する
                ignoreBlurUntilRef.current = Date.now() + 800;
                setIsEditing(true);
                setCursorPosition(0);

                // Fix 5 (Revert): Editor focus alone was insufficient.
                // Re-enable explicit window focus, but slightly delayed to ensure it happens 
                // AFTER the window is created and ready, supporting the editor focus loop.
                setTimeout(async () => {
                    const win = getCurrentWindow();
                    await win.setFocus();
                    invoke('fusen_force_focus').catch(e => console.error('[STICKY_LOAD] Backend force focus failed:', e));
                }, 100);
            }
        });
    }, [urlPath, isNew]); // Fix 2: Add isNew to dependency array

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

    // チェックボックスのトグル処理
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

    // 編集モード開始
    const handleEditStart = (cursorPos?: number) => {
        if (isEditing) return;
        // 2) 編集開始直後もしばらく Blur を無視する
        ignoreBlurUntilRef.current = Date.now() + 800;
        setIsEditing(true);
        setEditBody(content); // 最新の状態をセット
        setCursorPosition(cursorPos ?? null);
    };

    // 編集モード終了


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
        if (!isEditing || !editorRef.current) return;

        // Fix 4: Simply request focus on edit start.
        // Actual cursor placement is handled by RichTextEditor's useEffect([cursorPosition])
        requestAnimationFrame(() => {
            editorRef.current?.focus();
        });

    }, [isEditing]); // Remove cursorPosition from dependency since RTE handles it

    // [New] Explicit Exit Conditions (Click Outside)
    useEffect(() => {
        if (!isEditing) return;

        const onPointerDownCapture = (e: PointerEvent) => {
            const target = e.target as Node;

            // Editor inner click: ignore
            if (editorHostRef.current?.contains(target)) return;

            // Toolbar click: ignore (if exists, e.g. .hoverBar)
            if ((target as HTMLElement)?.closest?.('.hoverBar')) return;

            // Click Outside: Trigger blur
            console.log('[Boundary] Click outside detected. Ending edit.');
            handleEditBlur();
        };

        window.addEventListener('pointerdown', onPointerDownCapture, true);
        return () => window.removeEventListener('pointerdown', onPointerDownCapture, true);
    }, [isEditing]);

    // [New] Explicit Exit Conditions (Window Inactive)
    useEffect(() => {
        if (!isEditing) return;

        const onWindowBlur = () => {
            // If debugging devtools, this might be annoying, but per spec:
            console.log('[Boundary] Window inactive. Ending edit.');
            handleEditBlur();
        };

        window.addEventListener('blur', onWindowBlur);
        return () => window.removeEventListener('blur', onWindowBlur);
    }, [isEditing]);

    // ドラッグ開始
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

        // 特定要素（ボタン、エディタ、本文）上では開始しない
        if (target.closest('button') || target.closest('.editorHost') || target.closest('article')) {
            // タイトルバー（.file-name）だけは特別に許可
            if (!target.classList.contains('file-name')) {
                return;
            }
        }

        // トリプルジップロック：距離(10px)・時間(150ms)・ボタン状態(押下中)
        const startX = e.clientX;
        const startY = e.clientY;
        const startTime = Date.now();

        const onPointerMove = (moveEvent: PointerEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            const elapsed = Date.now() - startTime;

            if ((Math.abs(dx) > 10 || Math.abs(dy) > 10) && elapsed > 150 && moveEvent.buttons === 1) {
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
    }, [isEditing]);



    // [New] Sync editBodyRef
    useEffect(() => {
        editBodyRef.current = editBody;
    }, [editBody]);

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

    // [New] Dirty Check
    const isDirty = isEditing
        ? (editBody !== content) || savePending
        : savePending;




    // Context Menu Logic
    const lastContextMenuPos = useRef<{ x: number, y: number } | null>(null);
    const shouldReopenMenu = useRef(false);

    const showContextMenu = useCallback(async (x?: number, y?: number) => {
        if (!selectedFile) return;

        try {
            // Import menu classes
            const { Menu, MenuItem, Submenu, PredefinedMenuItem } = await import('@tauri-apps/api/menu');
            const { getCurrentWindow } = await import('@tauri-apps/api/window');

            // Filename display            // Common Items
            const filenameItem = await MenuItem.new({
                id: 'ctx_filename',
                text: getFileName(selectedFile.path),
                enabled: false,
            });

            const separator1 = await PredefinedMenuItem.new({ item: 'Separator' });

            const openFolderItem = await MenuItem.new({
                id: 'ctx_open_folder',
                text: '📂 フォルダを開く',
                action: async () => {
                    await invoke('fusen_open_containing_folder', { path: selectedFile.path });
                }
            });

            const newNoteItem = await MenuItem.new({
                id: 'ctx_new_note',
                text: '📝 新規メモ',
                action: async () => { /* ... existing logic ... */
                    try {
                        const normalizedPath = selectedFile.path.replace(/\\/g, '/');
                        const folderPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));
                        const note = await invoke<Note>('fusen_create_note', { folderPath, context: '' });
                        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
                        const sanitizedPath = note.meta.path.replace(/[^a-zA-Z0-9]/g, '_');
                        const label = `note_${sanitizedPath}`;
                        new WebviewWindow(label, {
                            url: `/?path=${encodeURIComponent(note.meta.path)}&isNew=1`, // Fix 1: Add isNew=1
                            title: 'Sticky Note',
                            width: 400,
                            height: 300,
                            decorations: false,
                            transparent: true
                        });
                    } catch (e) {
                        console.error('New note error', e);
                    }
                }
            });

            // Color Items
            const colorItems = [
                await MenuItem.new({ id: 'ctx_color_blue', text: '🔵 Blue', action: () => handleColorChange('#80d8ff') }),
                await MenuItem.new({ id: 'ctx_color_pink', text: '🌸 Pink', action: () => handleColorChange('#ffcdd2') }),
                await MenuItem.new({ id: 'ctx_color_yellow', text: '💛 Yellow', action: () => handleColorChange('#f7e9b0') })
            ];
            const colorSubmenu = await Submenu.new({ id: 'ctx_color_submenu', text: '🎨 色変更', items: colorItems });

            const separatorCommon = await PredefinedMenuItem.new({ item: 'Separator' });

            // --- Dynamic Part ---
            let menuItems: any[] = [
                filenameItem,
                separator1,
                openFolderItem,
                await PredefinedMenuItem.new({ item: 'Separator' }), // Sep before New Note
                newNoteItem,
                colorSubmenu,
                separatorCommon
            ];

            if (isTagDeleteMode) {
                console.log('[ShowContextMenu] Building menu in DELETE MODE.');
                // DELETE MODE: Flattened Tags
                menuItems.push(await MenuItem.new({ id: 'header_del', text: '⚠️ 削除モード (タグを選択して削除)', enabled: false }));

                try {
                    const tags = await invoke<string[]>('fusen_get_all_tags');
                    console.log('[ShowContextMenu] Fetched tags for delete mode:', tags);
                    if (tags.length > 0) {
                        for (const tag of tags) {
                            menuItems.push(await MenuItem.new({
                                id: `ctx_del_tag_${tag}`,
                                text: `🗑️ ${tag}`,
                                action: async () => {
                                    console.log('Requesting delete for:', tag);
                                    setTagToDelete(tag);
                                }
                            }));
                        }
                    } else {
                        menuItems.push(await MenuItem.new({ id: 'ctx_no_tags', text: '(タグなし)', enabled: false }));
                    }
                } catch (e) { console.error('Failed to load tags in delete mode:', e); }

                menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
                menuItems.push(await MenuItem.new({
                    id: 'ctx_exit_mode',
                    text: '⬅️ 通常モードに戻る',
                    action: () => {
                        shouldReopenMenu.current = true;
                        setIsTagDeleteMode(false);
                    }
                }));

            } else {
                console.log('[ShowContextMenu] Building menu in NORMAL MODE.');
                // NORMAL MODE: Tag Submenu
                const tagNewItem = await MenuItem.new({
                    id: 'ctx_tag_new',
                    text: '➕ 新規追加',
                    action: async () => {
                        /* Reuse logic to fetch tags and show modal */
                        try {
                            const tags = await invoke<string[]>('fusen_get_all_tags');
                            setAllTags(tags);
                            if (selectedFile) {
                                const note = await invoke<Note>('fusen_read_note', { path: selectedFile.path });
                                const { front } = splitFrontMatter(note.body);
                                const tagsMatch = front.match(/tags:\s*\[([^\]]*)\]/);
                                if (tagsMatch) setCurrentTags(tagsMatch[1].split(',').map(t => t.trim()).filter(t => t));
                                else setCurrentTags([]);
                            }
                            setShowTagModal(true);
                            setTagInputValue('');
                        } catch (e) { console.error('Failed to load tags for new tag modal:', e); }
                    }
                });

                let tagSubItems: any[] = [tagNewItem];
                try {
                    const tags = await invoke<string[]>('fusen_get_all_tags');
                    console.log('[ShowContextMenu] Fetched tags for normal mode:', tags);
                    // Fetch current file tags logic
                    let currentNoteTags: string[] = [];
                    if (selectedFile) {
                        const note = await invoke<Note>('fusen_read_note', { path: selectedFile.path });
                        const { front } = splitFrontMatter(note.body);
                        const tagsMatch = front.match(/tags:\s*\[([^\]]*)\]/);
                        if (tagsMatch) currentNoteTags = tagsMatch[1].split(',').map(t => t.trim()).filter(t => t);
                    }

                    if (tags.length > 0) {
                        tagSubItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
                        for (const tag of tags) {
                            const isChecked = currentNoteTags.includes(tag);
                            tagSubItems.push(await MenuItem.new({
                                id: `ctx_tag_${tag}`,
                                text: isChecked ? `☑ ${tag}` : `☐ ${tag}`,
                                action: async () => {
                                    try {
                                        if (!selectedFile) return;
                                        if (isChecked) await invoke('fusen_remove_tag', { path: selectedFile.path, tag });
                                        else await invoke('fusen_add_tag', { path: selectedFile.path, tag });
                                        shouldReopenMenu.current = true;
                                        // Refresh local
                                        const note = await invoke<Note>('fusen_read_note', { path: selectedFile.path });
                                        const { front, body } = splitFrontMatter(note.body);
                                        setRawFrontmatter(front);
                                        setContent(body);
                                        setEditBody(body);
                                    } catch (e) { console.error('Failed to toggle tag:', e); }
                                }
                            }));
                        }
                        tagSubItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
                        tagSubItems.push(await MenuItem.new({
                            id: 'ctx_enter_del_mode',
                            text: '🔧 削除モードにする',
                            action: () => {
                                shouldReopenMenu.current = true;
                                setIsTagDeleteMode(true);
                            }
                        }));
                    } else {
                        tagSubItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
                        tagSubItems.push(await MenuItem.new({
                            id: 'ctx_no_tags_normal',
                            text: '(タグがありません)',
                            enabled: false
                        }));
                    }
                } catch (e) { console.error('Failed to load tags for submenu:', e); }

                const tagSubmenu = await Submenu.new({ id: 'ctx_tags_submenu', text: '🏷️ タグ', items: tagSubItems });
                menuItems.push(tagSubmenu);
            }

            // Delete Note Item (Always available at bottom)
            menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
            menuItems.push(await MenuItem.new({
                id: 'ctx_delete',
                text: '🗑️ このメモを削除',
                action: async () => {
                    await invoke('fusen_move_to_trash', { path: selectedFile.path });
                }
            }));

            menuRef.current = await Menu.new({ id: 'context_menu', items: menuItems });


            // Use provided coordinates OR last known position OR cursor
            if (x !== undefined && y !== undefined) {
                const { LogicalPosition } = await import('@tauri-apps/api/dpi');
                await menuRef.current.popup(new LogicalPosition(x, y));
            } else {
                await menuRef.current.popup();
            }

        } catch (err) {
            console.error('Failed to show context menu', err);
        }
    }, [selectedFile, isTagDeleteMode, loadFileContent, noteBackgroundColor, rawFrontmatter, setEditBody, setSavePending]);

    // Handle initial right click
    useEffect(() => {
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();

            // [New] Commit before menu opens
            if (isEditing) handleEditBlur();

            lastContextMenuPos.current = { x: e.clientX, y: e.clientY };
            showContextMenu(e.clientX, e.clientY);
        };

        window.addEventListener('contextmenu', handleContextMenu);
        return () => {
            window.removeEventListener('contextmenu', handleContextMenu);
        };
    }, [showContextMenu]);

    // Handle auto-reopen on mode switch
    useEffect(() => {
        if (shouldReopenMenu.current && lastContextMenuPos.current) {
            shouldReopenMenu.current = false;
            // Short delay to ensure previous menu is fully closed/state updated
            setTimeout(() => {
                showContextMenu(lastContextMenuPos.current?.x, lastContextMenuPos.current?.y);
            }, 50);
        }
    }, [isTagDeleteMode, showContextMenu]);

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

    const handleEditBlur = async () => { // Parameterless
        if (!selectedFile) return;
        if (isCommittingRef.current) return; // Prevent double commit

        isCommittingRef.current = true;
        setSavePending(false); // Cancel pending auto-save NOW

        console.log('[DEBUG] handleEditBlur (Commit) triggered.');

        // [Strict] Get fresh content directly from editor to avoid state lag
        let currentBody = editBodyRef.current;
        if (editorRef.current?.getContent) {
            // Note: editorRef might be null if called after unmount, but usually we are here because of blur/escape
            currentBody = editorRef.current.getContent();
            // Sync state immediately to avoid ghosts
            setEditBody(currentBody);
            editBodyRef.current = currentBody;
        }

        setIsEditing(false);
        lastEditEndedAt.current = Date.now();

        // 統一された保存処理を使用 (リネーム判定も含む)
        try {
            // Commit -> allowRename = true
            await saveNote(selectedFile.path, currentBody, rawFrontmatter, true);
        } catch (e) {
            console.error('Save failed in blur', e);
        } finally {
            isCommittingRef.current = false;
        }
    };


    // [New] Edit Mode Boundaries (Explicit Exit) - Moved here to avoid "used before declaration"
    useEffect(() => {
        if (!isEditing) return;

        const onWindowBlur = () => {
            console.log('[Boundary] Window Blur. Committing.');
            handleEditBlur(); // No args
        };

        window.addEventListener('blur', onWindowBlur);
        return () => {
            window.removeEventListener('blur', onWindowBlur);
        };
    }, [isEditing, handleEditBlur]); // editBodyRef is stable

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
                frontmatterRaw: rawFrontmatter,
                allowRename: false // Initial save for duplicate, no rename needed
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

    // Global Tag Delete Handler
    const executeTagDelete = async () => {
        if (!tagToDelete) return;

        console.log('[Frontend] Executing global delete for:', tagToDelete);
        try {
            const count = await invoke<number>('fusen_delete_tag_globally', { tag: tagToDelete });
            console.log(`[Frontend] Deleted tag ${tagToDelete} from ${count} notes.`);
            if (count === 0) {
                console.warn('[Frontend] Backend reported 0 notes modified. Is the tag matching correct?');
            }

            // Wait a bit for backend state/file IO to settle (mitigate race condition)
            await new Promise(resolve => setTimeout(resolve, 300));

            // STAY in Delete Mode and reopen menu to show updated list
            shouldReopenMenu.current = true;

            if (selectedFile) loadFileContent(selectedFile);
        } catch (e) {
            console.error('Failed to delete tag globally:', e);
            alert(`タグの削除に失敗しました。\nエラー: ${e}`);
        } finally {
            setTagToDelete(null);
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
                    handleColorChange(color);
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
    }, [selectedFile, noteBackgroundColor, savePending, rawFrontmatter, editBody, content]);

    // タグ追加ハンドラー
    const handleAddTag = async () => {
        if (!selectedFile || !tagInputValue.trim()) return;

        try {
            await invoke('fusen_add_tag', {
                path: selectedFile.path,
                tag: tagInputValue.trim()
            });

            // モーダルを閉じる
            setShowTagModal(false);
            setTagInputValue('');

            // 全タグを再取得
            const tags = await invoke<string[]>('fusen_get_all_tags');
            setAllTags(tags);

            // ノートを再読み込みして現在のタグも更新
            const note = await invoke<Note>('fusen_read_note', { path: selectedFile.path });
            const { front, body } = splitFrontMatter(note.body);
            setRawFrontmatter(front);
            setContent(body);
            setEditBody(body);

            // 現在のタグを更新
            const tagsMatch = front.match(/tags:\s*\[([^\]]*)\]/);
            if (tagsMatch) {
                const noteTags = tagsMatch[1].split(',').map(t => t.trim()).filter(t => t);
                setCurrentTags(noteTags);
            }
        } catch (e) {
            console.error('Failed to add tag:', e);
        }
    };

    if (loading) return <div>Loading...</div>;
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
                        onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                        }}
                        onClick={() => editorRef.current?.insertBold()}
                        className="font-bold text-red-600 hover:bg-gray-100 px-2 min-w-[32px] rounded text-sm flex items-center justify-center whitespace-nowrap"
                        title="太字 (赤)"
                    >
                        B
                    </button>
                    <button
                        onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                        }}
                        onClick={() => editorRef.current?.insertHeading1()}
                        className="font-bold text-gray-700 hover:bg-gray-100 px-2 min-w-[32px] rounded text-sm flex items-center justify-center whitespace-nowrap"
                        title="見出し1"
                    >
                        <span style={{ fontSize: '14px', position: 'relative', top: '-1px' }}>H<sub style={{ bottom: '0', fontSize: '10px' }}>1</sub></span>
                    </button>
                    <button
                        onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                        }}
                        onClick={() => editorRef.current?.insertList()}
                        className="text-gray-700 hover:bg-gray-100 px-2 min-w-[32px] rounded flex items-center justify-center"
                        title="箇条書き"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="9" y1="6" x2="20" y2="6"></line>
                            <line x1="9" y1="12" x2="20" y2="12"></line>
                            <line x1="9" y1="18" x2="20" y2="18"></line>
                            <circle cx="5" cy="6" r="1.5" fill="currentColor"></circle>
                            <circle cx="5" cy="12" r="1.5" fill="currentColor"></circle>
                            <circle cx="5" cy="18" r="1.5" fill="currentColor"></circle>
                        </svg>
                    </button>
                    <button
                        onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                        }}
                        onClick={() => editorRef.current?.insertCheckbox()}
                        className="text-gray-700 hover:bg-gray-100 px-2 min-w-[32px] rounded flex items-center justify-center"
                        title="チェックボックス"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                            <polyline points="9 11 12 14 22 4"></polyline>
                        </svg>
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
            <main
                className="flex-1 overflow-y-auto h-full w-full notePaper noteMain pb-10"
                style={{
                    backgroundColor: noteBackgroundColor,
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '12px', // パディングを固定してズレを防止
                    boxSizing: 'border-box',
                    position: 'relative' // HoverBarのsticky基準にする
                }}
            >
                {/* Header / Drag Handle */}
                <div
                    className="file-name"
                    onPointerDown={handleDragStart}
                    style={{
                        cursor: isDraggableArea || isEditableArea ? 'move' : 'default',
                        userSelect: 'none',
                        touchAction: 'none'
                    }}
                >
                    <span className="file-icon">
                        {/* Icon based on file type if needed */}
                    </span>
                    {getFileName(selectedFile?.path || '')}

                    {/* UI Indicators */}
                    {isEditing && (
                        <span className="ml-2 text-red-600 font-bold text-lg leading-none" title="編集中">●</span>
                    )}
                    {!isEditing && isDirty && <span className="ml-1 text-xs">●</span>}
                    {/* isDirty dot is redundant if we have the red editing dot?
                    User asked for "Red dot for editing" AND "●".
                    "編集中を示す●だけ出してほしい" -> "I want only the dot that indicates *editing*".
                    So let's show ONE red dot if isEditing.
                    If !isEditing but isDirty (unsaved), maybe show a different dot?
                    User said "赤丸がいいな" (Red dot is good).
                    Let's just use one red dot for "Editing Mode".
                */}
                </div>

                {/* ツールバーをスクロールに追従させるためのstickyコンテナ */}
                <div style={{
                    position: 'sticky',
                    top: '-4px',
                    zIndex: 100,
                    display: 'flex',
                    justifyContent: 'flex-end',
                    pointerEvents: 'none',
                    height: 0,
                    marginBottom: '10px'
                }}>
                    <HoverBar show={isHover} />
                </div>
                {loading ? (
                    <div className="text-center text-gray-300 py-8 text-xs font-mono opacity-30">Loading...</div>
                ) : isEditing ? (
                    <div
                        className="editorHost notePaper"
                        ref={editorHostRef} // [New Ref]
                        style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            cursor: isEditing ? 'text' : 'default' // Add visual cue
                        }}
                    >
                        <RichTextEditor
                            ref={editorRef}
                            value={editBody}
                            onChange={(newValue) => {
                                setEditBody(newValue);
                                setSavePending(true);
                            }}
                            onBlur={() => handleEditBlur()}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') handleEditBlur();
                            }}
                            backgroundColor={noteBackgroundColor}
                            cursorPosition={cursorPosition}
                        />
                    </div>
                ) : (
                    <article
                        className="notePaper max-w-none"
                        style={{
                            backgroundColor: noteBackgroundColor,
                            whiteSpace: 'pre-wrap',
                            cursor: 'text',
                            padding: 0, // 親のmainでパディングしているので0にする
                            fontSize: '10.5px', // 明示的に指定
                            lineHeight: '1.4',
                            letterSpacing: '0.01em'
                        }}
                        onClick={(e) => {
                            // テキストのどこをクリックしたかによって、編集モードの初期カーソル位置を決めたい（将来用）
                            const selection = window.getSelection();
                            let offset = 0;
                            if (selection && selection.rangeCount > 0) {
                                // 簡易的なオフセット取得（完全ではない）
                                // handleEditStart(offset);
                            }
                            handleEditStart();
                        }}
                    >
                        {content ? (
                            <div style={{ whiteSpace: 'pre-wrap' }}>
                                {content.split('\n').map((line, i) => {
                                    // 1行の共通スタイル
                                    const lineStyle: React.CSSProperties = {
                                        margin: 0,
                                        padding: 0,
                                        lineHeight: '1.4',
                                        minHeight: '1.4em', // 14.7px相当。エディタの1行と確実に一致させる
                                        display: 'flex',
                                        alignItems: 'flex-start'
                                    };

                                    if (line.trim() === '') {
                                        return <div key={i} data-line-index={i} style={lineStyle}>&nbsp;</div>;
                                    }

                                    if (line.startsWith('# ')) {
                                        return (
                                            <div key={i} data-line-index={i} style={{ ...lineStyle, fontWeight: 700 }}>
                                                {line.substring(2)}
                                            </div>
                                        );
                                    }

                                    // チェックボックス (タスクリスト)
                                    const taskMatch = line.match(/^([\-\*\+]\s+\[)([ xX])(\]\s+.*)$/);
                                    if (taskMatch) {
                                        const isChecked = taskMatch[2].toLowerCase() === 'x';
                                        return (
                                            <div key={i} data-line-index={i} style={lineStyle}>
                                                <span
                                                    onClick={(e) => {
                                                        e.stopPropagation(); // 編集モード移行を防ぐ
                                                        handleToggleCheckbox(i);
                                                    }}
                                                    style={{
                                                        marginRight: '6px',
                                                        color: isChecked ? '#4caf50' : '#888',
                                                        flexShrink: 0,
                                                        display: 'inline-block',
                                                        width: '1em',
                                                        textAlign: 'center',
                                                        cursor: 'pointer', // 押せることが分かるように
                                                        userSelect: 'none'
                                                    }}
                                                    title={isChecked ? '未完了にする' : '完了にする'}
                                                >
                                                    {isChecked ? '☑' : '☐'}
                                                </span>
                                                <span style={{ textDecoration: isChecked ? 'line-through' : 'none', opacity: isChecked ? 0.6 : 1 }}>
                                                    {taskMatch[3].substring(2)}
                                                </span>
                                            </div>
                                        );
                                    }

                                    // 箇条書き (リスト)
                                    const listMatch = line.match(/^[\-\*\+]\s+(.*)$/);
                                    if (listMatch) {
                                        return (
                                            <div key={i} data-line-index={i} style={lineStyle}>
                                                <span style={{
                                                    marginRight: '8px',
                                                    color: '#ff8c00',
                                                    flexShrink: 0,
                                                    display: 'inline-block',
                                                    width: '1em',
                                                    textAlign: 'center'
                                                }}>•</span>
                                                <span>{listMatch[1]}</span>
                                            </div>
                                        );
                                    }

                                    const parts = line.split(/(\*\*[^*]+\*\*)/g);
                                    const rendered = parts.map((part, j) => {
                                        if (part.startsWith('**') && part.endsWith('**')) {
                                            return (
                                                <strong key={j} style={{ color: 'red', fontWeight: 'bold' }}>
                                                    {part.slice(2, -2)}
                                                </strong>
                                            );
                                        }
                                        return part;
                                    });

                                    return (
                                        <div key={i} data-line-index={i} style={lineStyle}>
                                            {rendered}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-gray-400 text-center py-8 text-xs font-mono opacity-50">
                                クリックして編集を開始
                            </div>
                        )}
                    </article>
                )}

                {/* 
                  【フッタードラッグ領域】
                   閲覧モード：ドラッグ可能領域、クリックで編集
                   編集モード：クリックで保存して閲覧モードへ戻る
                */}
                <div
                    className="note-footer"
                    style={{
                        flexGrow: 1,
                        minHeight: '100px',
                        cursor: 'grab',
                    }}
                    onPointerDown={(e) => {
                        // 【完全独立型ドラッグ管理】
                        // 親要素(noteShell)へのイベント伝播を常に遮断し、競合を物理的に排除する
                        e.stopPropagation();

                        // 閲覧モードかつクールダウン期間外の場合のみ、ここからドラッグを開始する
                        if (!isEditing && (Date.now() - lastEditEndedAt.current >= 500)) {
                            handleDragStart(e);
                        }
                    }}
                    onClick={() => isEditing && handleEditBlur(editBody)}
                    title="ドラッグで移動 / クリックで保存"
                />
            </main>

            {/* カスタムモーダルダイアログ - 新規タグ追加 */}
            {showTagModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10000
                }}>
                    <div style={{
                        backgroundColor: '#fff',
                        padding: '24px',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        minWidth: '320px',
                        maxWidth: '400px'
                    }}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold' }}>新規タグを追加</h3>

                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                            <input
                                type="text"
                                value={tagInputValue}
                                onChange={(e) => setTagInputValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && tagInputValue.trim()) {
                                        e.preventDefault();
                                        handleAddTag();
                                    } else if (e.key === 'Escape') {
                                        setShowTagModal(false);
                                        setTagInputValue('');
                                    }
                                }}
                                placeholder="タグ名を入力"
                                autoFocus
                                style={{
                                    flex: 1,
                                    padding: '8px 12px',
                                    border: '1px solid #ddd',
                                    borderRadius: '4px',
                                    fontSize: '14px'
                                }}
                            />
                            <button
                                onClick={handleAddTag}
                                disabled={!tagInputValue.trim()}
                                style={{
                                    padding: '8px 16px',
                                    border: 'none',
                                    borderRadius: '4px',
                                    backgroundColor: tagInputValue.trim() ? '#28a745' : '#ccc',
                                    color: '#fff',
                                    cursor: tagInputValue.trim() ? 'pointer' : 'not-allowed',
                                    fontSize: '14px',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                追加
                            </button>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => {
                                    setShowTagModal(false);
                                    setTagInputValue('');
                                }}
                                style={{
                                    padding: '6px 12px',
                                    border: '1px solid #ddd',
                                    borderRadius: '4px',
                                    backgroundColor: '#fff',
                                    cursor: 'pointer',
                                    fontSize: '13px'
                                }}
                            >
                                キャンセル
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Confirmation Dialog for Global Tag Deletion */}
            <ConfirmDialog
                isOpen={!!tagToDelete}
                title="タグの削除"
                message={`タグ「${tagToDelete}」をすべてのメモから削除しますか？\nこの操作は元に戻せません。`}
                onConfirm={executeTagDelete}
                onCancel={() => {
                    setTagToDelete(null);
                    shouldReopenMenu.current = true;
                }}
            />
        </div>
    );
});

export default StickyNote;
