'use client';

import { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import React from 'react';
import { useSearchParams } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { pathsEqual } from '../utils/pathUtils';
import { playDeleteSound } from '../utils/soundManager';
import { getFontSize } from '../utils/settingsManager';
import RichTextEditor, { RichTextEditorRef } from './RichTextEditor';
import ConfirmDialog from './ConfirmDialog';
import ResizableImage from './ResizableImage';

import { useSettings } from "@/lib/settings-store";
import { getTranslation, type Language } from "@/lib/i18n";

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
    background_color?: string;
    always_on_top?: boolean;
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

    // [i18n]
    const { settings } = useSettings();
    const t = useMemo(() => getTranslation((settings.language as Language) || 'ja'), [settings.language]);

    // [New] Line Offset Calculation for precise cursor positioning
    const lineOffsets = useMemo(() => {
        let offset = 0;
        return (content || '').split('\n').map(line => {
            const current = offset;
            offset += line.length + 1; // +1 for newline character
            return current;
        });
    }, [content]);
    const [loading, setLoading] = useState<boolean>(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editBody, setEditBody] = useState('');
    const [savePending, setSavePending] = useState(false);
    const [cursorPosition, setCursorPosition] = useState<number | null>(null);
    const [isNewNote, setIsNewNote] = useState(false); // [NEW] 新規ノートフラグ（state管理）
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [rawFrontmatter, setRawFrontmatter] = useState<string>('');
    const [noteBackgroundColor, setNoteBackgroundColor] = useState<string>('#f7e9b0');
    const [noteFontSize, setNoteFontSize] = useState<number>(16); // 設定から読み込むフォントサイズ
    // リネームによる更新かどうかを判定するフラグ
    const isRenamingRef = useRef(false);
    // [Strict Rename] コミット（編集終了）処理中ガード
    const isCommittingRef = useRef(false);

    // [New] Selection & Pointer Refs
    const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
    const pointerDownRef = useRef<{ x: number; y: number } | null>(null);

    const lastEditEndedAt = useRef<number>(0);
    // [New] 初期ロードやフォーカス揺れによる誤Blurを防ぐタイマー
    const ignoreBlurUntilRef = useRef<number>(0);

    const editorRef = useRef<RichTextEditorRef>(null);

    // [Fix] Sync font size from settings
    // [Fix] Sync font size from settings
    useEffect(() => {
        setNoteFontSize(settings.font_size);
    }, [settings.font_size]);

    // [New] Listen for global settings update from backend
    useEffect(() => {
        let unlisten: (() => void) | undefined;
        (async () => {
            try {
                const { listen } = await import('@tauri-apps/api/event');
                unlisten = await listen<any>("settings_updated", (event) => {
                    const newSettings = event.payload;
                    console.log("[STICKY]收到設定更新イベント:", newSettings);
                    if (newSettings && typeof newSettings.font_size === 'number') {
                        console.log("[STICKY] フォントサイズを更新します:", newSettings.font_size);
                        setNoteFontSize(newSettings.font_size);
                    }
                });
            } catch (e) {
                console.error("Failed to setup settings_updated listener", e);
            }
        })();
        return () => { if (unlisten) unlisten(); };
    }, []);
    const editorHostRef = useRef<HTMLDivElement>(null); // [New boundary ref]
    const editBodyRef = useRef(editBody); // [New] Stale closure fix
    const isCapturingRef = useRef(false); // [New] Block blur during capture


    // [Safety] アプリ内ドラッグの状態をグローバルに監視する
    // これにより、ドラッグ操作による意図しないBlur（編集終了）を防ぐ
    useEffect(() => {
        const handleDragStart = () => {
            console.log('[Safety] Internal Drag Started');
            // isInternalDragRef.current = true;
        };

        const handleDragEnd = () => {
            console.log('[Safety] Internal Drag Ended');
            // ドロップ処理とBlur発火の競合を防ぐため、わずかな猶予を持たせてフラグを下ろす
            setTimeout(() => {
                // isInternalDragRef.current = false;
            }, 100);
        };

        window.addEventListener('dragstart', handleDragStart);
        window.addEventListener('dragend', handleDragEnd);
        // ドラッグ失敗やキャンセルに備えて drop も監視
        window.addEventListener('drop', handleDragEnd);

        return () => {
            window.removeEventListener('dragstart', handleDragStart);
            window.removeEventListener('dragend', handleDragEnd);
            window.removeEventListener('drop', handleDragEnd);
        };
    }, []);

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

    // [Helpers moved to after saveNote]


    // [New] Header Drag Handler (No Maximize, Works in Edit Mode)
    const handleHeaderDrag = useCallback((e: React.PointerEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        // No stopPropagation? standard drag region consumes it usually.
        // Custom drag need to call startDragging.

        try {
            getCurrentWindow().startDragging();
        } catch (err) {
            console.error('startDragging failed', err);
        }
    }, []);

    // [New] Link Parser Helper
    const parseLinks = (text: string, baseOffset: number) => {
        // 1. Web URL: http:// or https://
        // 2. Windows Path: 
        //    a) Drive Letter: C:\... (exclude invalid chars)
        //    b) UNC: \\Server\...
        const regex = /((?:https?:\/\/[^\s]+)|(?:[a-zA-Z]:\\[^:<>"\/?*|\r\n]+)|(?:\\\\[^:<>"\/?*|\r\n]+))/g;

        const parts = text.split(regex);
        let currentOffset = 0;

        return <>{parts.map((part, k) => { // Use Fragment to return array compliant
            if (part === '') return null;

            const partStart = baseOffset + currentOffset;
            currentOffset += part.length;

            if (regex.test(part)) {
                return (
                    <span
                        key={k}
                        style={{
                            color: 'blue',
                            textDecoration: 'underline',
                            cursor: 'pointer',
                        }}
                        data-src-start={partStart}
                        data-tauri-drag-region="false" // リンク上はドラッグ無効化
                        onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('[OpenLink]', part);
                            try {
                                if (/^https?:\/\//i.test(part)) {
                                    const { open } = await import('@tauri-apps/plugin-shell');
                                    await open(part);
                                } else {
                                    const { invoke } = await import('@tauri-apps/api/core');
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

            return <span key={k} data-src-start={partStart}>{part}</span>;
        })}</>;
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
            console.log('[DEBUG] saveNote result:', { old: path, new: newPath, renamed: !pathsEqual(newPath, path) });
            if (!pathsEqual(newPath, path)) {
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



    // [Moved] Helpers relying on saveNote
    const updateNoteContent = useCallback(async (newContent: string) => {
        if (!selectedFile) return;
        try {
            setEditBody(newContent);
            setContent(newContent);
            await saveNote(selectedFile.path, newContent, rawFrontmatter, false);
        } catch (e) {
            console.error('Failed to update content', e);
        }
    }, [selectedFile, rawFrontmatter, saveNote]);

    const handleImageResize = (newScale: number, baseOffset: number, originalText: string) => {
        if (!content) return;

        // Verify match to update content correctly
        const targetStr = content.substring(baseOffset, baseOffset + originalText.length);
        if (targetStr !== originalText) return;

        const match = originalText.match(/!\[([^\]]*)\]\(([^)]+)\)/);
        if (!match) return;

        const rawAlt = match[1];
        const url = match[2];
        const altParts = rawAlt.split('|');
        const realAlt = altParts[0];

        // Save as |scale (e.g. 1.5)
        const newMarkdown = `![${realAlt}|${newScale}](${url})`;
        const before = content.substring(0, baseOffset);
        const after = content.substring(baseOffset + originalText.length);

        updateNoteContent(before + newMarkdown + after);
    };

    // Helper to resolve relative path to absolute
    const resolvePath = (baseFile: string, relativePath: string) => {
        // If already absolute or http, return as is
        if (/^[a-zA-Z]:\\|^\\\\|^http/.test(relativePath)) return relativePath;

        // Extract directory - support both \ and /
        const lastSlash = Math.max(baseFile.lastIndexOf('\\'), baseFile.lastIndexOf('/'));
        const baseDir = lastSlash >= 0 ? baseFile.substring(0, lastSlash) : '';

        // Join and normalize to backslashes for Windows absolute paths
        const combined = `${baseDir}/${relativePath}`.replace(/\//g, '\\');

        // Ensure we don't have double backslashes unless it's UNC
        const absPath = combined.replace(/\\\\+/g, '\\');
        // But if it was UNC, we want to keep the first two
        if (combined.startsWith('\\\\')) {
            return '\\\\' + absPath.substring(1).replace(/\\+/g, '\\');
        }

        console.log('[STICKY] Resolved path:', { baseFile, relativePath, absPath });
        return absPath;
    };

    // [New] content renderer that handles Images > Links > Text
    const renderLineContent = (text: string, baseOffset: number) => {
        const imgRegex = /(!\[([^\]]*)\]\(([^)]+)\))/g;
        const parts = [];
        let lastIndex = 0;
        let match;

        while ((match = imgRegex.exec(text)) !== null) {
            const fullMatch = match[0];
            const altTextRaw = match[2];
            const urlRaw = match[3];
            const index = match.index;

            if (index > lastIndex) {
                parts.push(parseLinks(text.substring(lastIndex, index), baseOffset + lastIndex));
            }

            // Resolve URL if relative
            let url = urlRaw;
            if (selectedFile && !/^[a-zA-Z]:\\|^\\\\|^http/.test(urlRaw)) {
                url = resolvePath(selectedFile.path, urlRaw);
            }

            const altParts = altTextRaw.split('|');
            const alt = altParts[0];

            // Parse scale: |1.5 or |150%? Assuming float |1.5 for now based on resize handler.
            let scale: number | undefined = undefined;
            if (altParts.length > 1) {
                const sStr = altParts[1];
                const s = parseFloat(sStr);
                if (!isNaN(s)) scale = s;
            }

            parts.push(
                <ResizableImage
                    key={baseOffset + index}
                    src={url}
                    alt={alt}
                    scale={scale}
                    baseOffset={baseOffset + index}
                    onResizeEnd={(s) => handleImageResize(s, baseOffset + index, fullMatch)}
                    contentReadOnly={false}
                />
            );
            lastIndex = index + fullMatch.length;
        }

        if (lastIndex < text.length) {
            parts.push(parseLinks(text.substring(lastIndex), baseOffset + lastIndex));
        }

        return parts;
    };

    // コンテンツ読み込み
    const loadFileContent = async (noteMeta: NoteMeta): Promise<string> => {
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
            return body; // [NEW] Return body for immediate use
        } catch (error) {
            console.error('read_note failed', error);
            setContent('');
            return ''; // [NEW] Return empty string on error
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
        loadFileContent(myNote).then(async (body) => {
            // Fix 2: Use captured isNew
            if (isNew) {
                console.log('[STICKY_LOAD] New note detected. Enabling edit mode.');
                // 3) 新規作成時はしばらく Blur を無視する
                ignoreBlurUntilRef.current = Date.now() + 800;
                setIsEditing(true);
                setIsNewNote(true); // [NEW] stateに保存

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

    // 設定からフォントサイズを読み込む
    useEffect(() => {
        getFontSize().then(size => {
            setNoteFontSize(size);
        });
    }, []);

    // イベントリスナー設定
    useEffect(() => {
        if (!selectedFile) return;

        let unlistenMove: (() => void) | undefined;
        let unlistenResize: (() => void) | undefined;

        const setupListeners = async () => {
            const win = getCurrentWindow();

            unlistenMove = await win.listen('tauri://move', () => {
                saveWindowState();
            });

            unlistenResize = await win.listen('tauri://resize', () => {
                saveWindowState();
            });
        };

        setupListeners();

        return () => {
            if (unlistenMove) unlistenMove();
            if (unlistenResize) unlistenResize();
        };
    }, [selectedFile, saveWindowState]);

    // Listen for reload events from global tag deletion
    useEffect(() => {
        console.log('[DEBUG] useEffect for reload listener triggered. selectedFile:', selectedFile?.path);

        if (!selectedFile) {
            console.log('[DEBUG] selectedFile is null, skipping listener setup');
            return;
        }

        const setupReloadListener = async () => {
            const { listen } = await import('@tauri-apps/api/event');
            const unlisten = await listen<string>('fusen:reload_note', async (event) => {
                const modifiedPath = event.payload;

                // Normalize paths for comparison (Windows uses backslash, Unix uses forward slash)
                const normalizedModifiedPath = modifiedPath.replace(/\\/g, '/').toLowerCase();
                const normalizedCurrentPath = selectedFile.path.replace(/\\/g, '/').toLowerCase();
                const pathsMatch = normalizedModifiedPath === normalizedCurrentPath;

                console.log('[RELOAD] Normalized modified path:', normalizedModifiedPath);
                console.log('[RELOAD] Normalized current path:', normalizedCurrentPath);
                console.log('[RELOAD] Paths match?', pathsMatch);

                // [Fix] Prevent self-overwrite logic
                if (isEditing || isCommittingRef.current || isRenamingRef.current) {
                    console.log('[RELOAD] Skipped due to active edit/commit/rename state.');
                    return;
                }

                // Only reload if this is the matching window
                if (pathsMatch) {
                    // Directly reload without calling loadFileContent to avoid dependency issues
                    try {
                        const { invoke } = await import('@tauri-apps/api/core');
                        const note = await invoke<Note>('fusen_read_note', { path: selectedFile.path });
                        const { front, body } = splitFrontMatter(note.body);
                        setRawFrontmatter(front);
                        setContent(body);
                        setEditBody(body);

                        const colorMatch = front.match(/backgroundColor:\s*["']?([^"'\s]+)["']?/);
                        if (colorMatch) {
                            setNoteBackgroundColor(colorMatch[1]);
                        }
                    } catch (error) {
                        console.error('[RELOAD] Failed to reload note:', error);
                    }
                }
            });

            return unlisten;
        };

        const cleanupPromise = setupReloadListener();

        return () => {
            cleanupPromise.then(unlisten => unlisten());
        };
    }, [selectedFile]);


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

    // カーソル位置設定 & 範囲選択復元
    useEffect(() => {
        if (!isEditing) return;

        const attemptFocus = (count = 0) => {
            if (count > 20) { // Timeout after ~300ms
                return;
            }
            if (editorRef.current) {
                // 範囲選択がある場合はそれを復元 (cursorPositionより優先)
                if (pendingSelectionRef.current) {
                    const { start, end } = pendingSelectionRef.current;
                    // ブラウザ側の選択解除を先に行う
                    window.getSelection()?.removeAllRanges();

                    editorRef.current.focus();
                    editorRef.current.setSelection(start, end);
                    pendingSelectionRef.current = null;
                } else {
                    // Fix 4: Simply request focus on edit start.
                    editorRef.current.focus();
                }
            } else {
                requestAnimationFrame(() => attemptFocus(count + 1));
            }
        };

        attemptFocus();
    }, [isEditing]); // Remove cursorPosition from dependency since RTE handles it

    // [New] Helper to calc offset based on data-src-start
    const calcOffsetFromDomPoint = (node: Node, offset: number): number | null => {
        const el = (node.nodeType === Node.TEXT_NODE
            ? (node.parentElement as HTMLElement | null)
            : (node as HTMLElement | null))?.closest?.("[data-src-start]") as HTMLElement | null;

        if (!el) return null;
        const startStr = el.getAttribute("data-src-start");
        if (!startStr) return null;

        const base = parseInt(startStr, 10);
        if (!Number.isFinite(base)) return null;

        // 最小実装：TextNode内のoffsetを足す
        // Note: For non-text nodes (e.g. clicking the element itself), offset might mean child index.
        // But getSelection often returns text nodes. If it returns element, offset is index.
        // For simplicity and safety per user request "minimal implementation":
        // just add max(0, offset) if it makes sense, or treat as base if naive.
        // If node is text node, offset is character offset.
        if (node.nodeType === Node.TEXT_NODE) {
            return base + Math.max(0, offset);
        }
        // If element, usually we want base.
        return base;
    };

    const normalizeRange = (a: number, b: number) => {
        return a <= b ? { start: a, end: b } : { start: b, end: a };
    };

    const onArticlePointerDown = (e: React.PointerEvent) => {

        pointerDownRef.current = { x: e.clientX, y: e.clientY };
        // handleDragStart might also listen to this, but here we track for click/edit logic.
        // handleDragStart uses its own logic.
    };

    const onArticlePointerUp = (e: React.PointerEvent) => {
        // [Refactor] Use setTimeout(0) to wait for selection to settle.
        // Capture coordinates for single click fallback
        const clientX = e.clientX;
        const clientY = e.clientY;
        const target = e.target as HTMLElement;

        // Check if interactive element
        if (target.closest('[data-interactable]')) return;

        pointerDownRef.current = null;

        setTimeout(() => {
            // 1. Check for valid selection (Double click or Drag)
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0 && sel.toString().length > 0) {
                console.log('[Pointer] Selection detected:', sel.toString());
                const range = sel.getRangeAt(0);
                const start = calcOffsetFromDomPoint(range.startContainer, range.startOffset);
                const end = calcOffsetFromDomPoint(range.endContainer, range.endOffset);

                if (start !== null && end !== null) {
                    pendingSelectionRef.current = normalizeRange(start, end);
                    handleEditStart(); // Selection will be applied by useEffect
                    return;
                }
            }

            // 2. No selection -> Single Click (Cursor positioning)
            // Use caretRangeFromPoint for precise offset
            // (Avoids jumping to line start caused by unstable window.getSelection() on click)
            console.log('[Pointer] No selection, calculating caret position from point.');

            let clickOffset = 0;
            // @ts-ignore - caretRangeFromPoint is widely supported but might be missing in TS lib
            if (document.caretRangeFromPoint) {
                // @ts-ignore
                const range = document.caretRangeFromPoint(clientX, clientY);
                if (range) {
                    const offset = calcOffsetFromDomPoint(range.startContainer, range.startOffset);
                    if (offset !== null) {
                        clickOffset = offset;
                        console.log('[Pointer] Calculated offset from point:', clickOffset);
                    }
                }
            }

            handleEditStart(clickOffset);
        }, 0);
    };






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
        const isInteractive = !!target.closest('button, textarea, input, [data-interactable="true"]');

        // チェックボックスやボタンなど「操作が必要なパーツ」以外は、どこでもドラッグを許可する
        if (isInteractive) {
            return;
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

    // [New] Sync currentTags with rawFrontmatter
    useEffect(() => {
        if (!rawFrontmatter) {
            setCurrentTags([]);
            return;
        }
        // Minimal RegEx parser for "tags: [a, b, c]"
        const tagsMatch = rawFrontmatter.match(/tags:\s*\[([^\]]*)\]/);
        if (tagsMatch) {
            const parsed = tagsMatch[1]
                .split(',')
                .map(t => t.trim())
                .filter(t => t.length > 0);
            setCurrentTags(parsed);
        } else {
            setCurrentTags([]);
        }
    }, [rawFrontmatter]);

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
                const interactive = target.closest('button, textarea, input, [data-interactable="true"]');

                if (interactive) {
                    setIsDraggableArea(false);
                    setIsEditableArea(false);
                } else {
                    // 全域をドラッグ可能にする（テキストの上でも掴めるように緩和）
                    setIsDraggableArea(true);
                    setIsEditableArea(true);
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
    }, []); // Only once for global move tracking

    // [New] Dynamic Cursor Style based on area
    const shellCursor = isEditing ? 'default' : (isDraggableArea ? 'grab' : 'default');

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
                text: `📂 ${t('menu.openFolder')}`,
                action: async () => {
                    await invoke('fusen_open_containing_folder', { path: selectedFile.path });
                }
            });

            const newNoteItem = await MenuItem.new({
                id: 'ctx_new_note',
                text: `📝 ${t('menu.newNote')}`,
                action: async () => {
                    try {
                        const normalizedPath = selectedFile.path.replace(/\\/g, '/');
                        const folderPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));
                        // Use default context "memo" for new notes instead of inheriting
                        const note = await invoke<Note>('fusen_create_note', { folderPath, context: 'memo' });

                        // Unify logic: Delegate to Orchestrator (page.tsx) to handle window creation/queuing
                        await emit('fusen:open_note', { path: note.meta.path, isNew: true });
                    } catch (e) {
                        console.error('New note error', e);
                    }
                }
            });

            // Color Items
            const colorItems = [
                await MenuItem.new({ id: 'ctx_color_blue', text: `🔵 ${t('menu.colors.blue')}`, action: () => handleColorChange('#80d8ff') }),
                await MenuItem.new({ id: 'ctx_color_pink', text: `🌸 ${t('menu.colors.pink')}`, action: () => handleColorChange('#ffcdd2') }),
                await MenuItem.new({ id: 'ctx_color_yellow', text: `💛 ${t('menu.colors.yellow')}`, action: () => handleColorChange('#f7e9b0') })
            ];
            const colorSubmenu = await Submenu.new({ id: 'ctx_color_submenu', text: `🎨 ${t('menu.changeColor')}`, items: colorItems });

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
                menuItems.push(await MenuItem.new({ id: 'header_del', text: `⚠️ ${t('menu.deleteMode')}`, enabled: false }));

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
                        menuItems.push(await MenuItem.new({ id: 'ctx_no_tags', text: `(${t('menu.noTags')})`, enabled: false }));
                    }
                } catch (e) { console.error('Failed to load tags in delete mode:', e); }

                menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
                menuItems.push(await MenuItem.new({
                    id: 'ctx_exit_mode',
                    text: `⬅️ ${t('menu.normalMode')}`,
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
                    text: `➕ ${t('menu.addTag')}`,
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

                                        // [Fix] Resolve conflict: save current state first to avoid overwriting tags later
                                        await saveNote(selectedFile.path, editBody, rawFrontmatter, false);
                                        setSavePending(false);

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
                            text: `🔧 ${t('menu.deleteMode')}`,
                            action: () => {
                                shouldReopenMenu.current = true;
                                setIsTagDeleteMode(true);
                            }
                        }));
                    } else {
                        tagSubItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
                        tagSubItems.push(await MenuItem.new({
                            id: 'ctx_no_tags_normal',
                            text: `(${t('menu.noTags')})`,
                            enabled: false
                        }));
                    }
                } catch (e) { console.error('Failed to load tags for submenu:', e); }

                const tagSubmenu = await Submenu.new({ id: 'ctx_tags_submenu', text: `🏷️ ${t('menu.tags')}`, items: tagSubItems });
                menuItems.push(tagSubmenu);
            }

            // Delete Note Item (Always available at bottom)
            menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
            menuItems.push(await MenuItem.new({
                id: 'ctx_delete',
                text: `🗑️ ${t('menu.delete')}`,
                action: async () => {
                    // [Sound] 設定に基づいて削除音を再生
                    await playDeleteSound();

                    // 音が聞こえるように少し待つ
                    await new Promise(resolve => setTimeout(resolve, 300));

                    await invoke('fusen_move_to_trash', { path: selectedFile.path });

                    // Close the window immediately
                    const win = getCurrentWindow();
                    await win.close();
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
    }, [selectedFile, isTagDeleteMode, loadFileContent, noteBackgroundColor, rawFrontmatter, setEditBody, setSavePending, t]);

    const handleEditBlur = useCallback(async () => { // Parameterless
        // [Ref Stability Check]
        // This function is now stable. It captures Refs (stable) and State (needs deps).
        // Since we use Refs for 'editBody' and 'isCommitting', we only really need 'selectedFile' and 'saveNote'.

        if (!selectedFile) return;
        if (isCommittingRef.current) {
            console.log('[DEBUG] handleEditBlur skipped: Already committing.');
            return;
        }
        if (isCapturingRef.current) {
            console.log('[DEBUG] handleEditBlur skipped: Capturing screen.');
            return;
        }

        isCommittingRef.current = true;
        setSavePending(false); // Cancel pending auto-save NOW

        console.log('[DEBUG] handleEditBlur (Commit) triggered. Ref Body:', editBodyRef.current?.length);

        // [Strict] Get fresh content directly from editor to avoid state lag
        let currentBody = editBodyRef.current;
        if (editorRef.current?.getContent) {
            currentBody = editorRef.current.getContent();
            // Sync state immediately
            setEditBody(currentBody);
            editBodyRef.current = currentBody;
        }

        setIsEditing(false);
        lastEditEndedAt.current = Date.now();

        // 統一された保存処理を使用
        try {
            await saveNote(selectedFile.path, currentBody, rawFrontmatter, true);
        } catch (e) {
            console.error('Save failed in blur', e);
        } finally {
            isCommittingRef.current = false;
        }
    }, [selectedFile, rawFrontmatter, saveNote]); // Minimal dependencies

    // Handle initial right click (Dependencies updated)
    useEffect(() => {
        const handleContextMenu = async (e: MouseEvent) => {
            e.preventDefault();
            if (isEditing) {
                await handleEditBlur();
            }
            lastContextMenuPos.current = { x: e.clientX, y: e.clientY };
            showContextMenu(e.clientX, e.clientY);
        };
        window.addEventListener('contextmenu', handleContextMenu);
        return () => window.removeEventListener('contextmenu', handleContextMenu);
    }, [showContextMenu, isEditing, handleEditBlur]); // handleEditBlur is now stable(ish)

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

    // [New] Edit Mode Boundaries (Explicit Exit)


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




    // [New] Edit Mode Boundaries (Explicit Exit) - Moved here to avoid "used before declaration"


    // [New] Edit Mode Boundaries (Explicit Exit)
    useEffect(() => {
        if (!isEditing) return;

        const onWindowBlur = () => {


            console.log('[Boundary] Window Blur. Committing.');
            handleEditBlur();
        };

        window.addEventListener('blur', onWindowBlur);
        return () => {
            window.removeEventListener('blur', onWindowBlur);
        };
    }, [isEditing, handleEditBlur]);




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

    // [New] おにぎり（画面キャプチャ）機能
    const handleCaptureScreen = async () => {
        try {
            const currentWin = getCurrentWindow();

            // [Strategy] Save selection before hiding
            let savedSelection: { anchor: number, head: number } | null = null;
            if (editorRef.current) {
                // Force cast to access view (interface update skipped)
                const view = (editorRef.current as any).view;
                if (view?.state) {
                    savedSelection = view.state.selection.main;
                    console.log('[STICKY] Saved selection before capture:', savedSelection);
                }
            }

            isCapturingRef.current = true; // [New] Lock blur handling

            // 1. 自分を隠す
            // Force blur to ensure we don't hold focus weirdly
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
            await currentWin.hide();

            // 2. 少し待つ（アニメーション完了待ち）
            await new Promise(resolve => setTimeout(resolve, 300));

            // 3. キャプチャ実行 (Backend) - Timeout 30s
            console.log('[STICKY] Invoking capture for seq:', selectedFile?.seq);
            const capturePromise = invoke<string>('fusen_capture_screen', { noteSeq: selectedFile?.seq || 0 });
            const timeoutPromise = new Promise<string>((_, reject) =>
                setTimeout(() => reject(new Error('Capture timed out')), 30000)
            );

            const imagePath = await Promise.race([capturePromise, timeoutPromise]);
            console.log('[STICKY] Captured:', imagePath);

            // 4. 自分を表示
            await currentWin.show();
            await currentWin.setFocus();

            // 重要：フォーカスが完全に復帰・安定するまで待つ (v2: 400ms)
            await new Promise(r => setTimeout(r, 400));

            // 5. 画像リンクを挿入
            // Convert to relative path if possible
            let storedPath = imagePath;
            const currentPath = selectedFile?.path;
            if (currentPath) {
                const lastSlash = Math.max(currentPath.lastIndexOf('\\'), currentPath.lastIndexOf('/'));
                const currentDir = lastSlash >= 0 ? currentPath.substring(0, lastSlash) : '';

                // Normalize paths for comparison
                const normImagePath = imagePath.replace(/\//g, '\\');
                const normCurrentDir = currentDir.replace(/\//g, '\\');

                if (normImagePath.startsWith(normCurrentDir)) {
                    // Simple case: subpath
                    let rel = normImagePath.substring(normCurrentDir.length);
                    if (rel.startsWith('\\')) rel = rel.substring(1);
                    // Use forward slashes for Markdown compatibility
                    storedPath = rel.replace(/\\/g, '/');
                }
            }
            console.log('[STICKY] Insert markdown path:', storedPath);

            // Markdown text to insert: ![filename](path)
            // Use simple filename as alt?
            // Extract filename from path
            const filenameObj = imagePath.split('\\').pop() || 'screenshot';
            // User requested: filename + scale (initially 1.0 or omitted)
            // Storing just ![filename](relPath)

            const imageMarkdown = `\n![${filenameObj}](${storedPath})\n`;

            console.log('[STICKY] Attempting insertion. editorRef.current exists?', !!editorRef.current);
            if (editorRef.current) {
                console.log('[STICKY] Explicitly focusing editor before insertText...');
                editorRef.current.focus();

                // Restore selection if saved
                const view = (editorRef.current as any).view;
                if (savedSelection && view) {
                    console.log('[STICKY] Restoring saved selection:', savedSelection);
                    try {
                        view.dispatch({
                            selection: { anchor: savedSelection.anchor, head: savedSelection.head }
                        });
                    } catch (e) {
                        console.warn('[STICKY] Failed to restore selection:', e);
                    }
                }

                editorRef.current.insertText(imageMarkdown);
            } else {
                console.log('[STICKY] Appending text to body (no editorRef)...');
                setEditBody(prev => prev + imageMarkdown);
                setSavePending(true);
            }

        } catch (e) {
            console.error('Capture failed', e);
            await getCurrentWindow().show(); // Ensure window comes back on error
            alert(`キャプチャに失敗しました: ${e}`);
        } finally {
            isCapturingRef.current = false; // [Fix] Always release lock
        }
    };

    // ホバーバー (編集モード時はツールバー)
    const HoverBar = ({ show }: { show: boolean }) => {
        if (!isEditing) return null;
        return (
            <div
                className="hoverBar"
                style={{
                    opacity: (show || isEditing) ? 1 : 0,
                    visibility: (show || isEditing) ? 'visible' : 'hidden',
                    pointerEvents: (show || isEditing) ? 'auto' : 'none',
                    transition: 'opacity 0.1s ease',
                    display: 'flex',
                    flexDirection: 'column', // Vertical layout as requested
                    alignItems: 'center',
                    gap: '8px',
                    padding: '4px',
                    backgroundColor: 'transparent', // 透明化して白い横線を消去
                    borderRadius: '8px',
                    backdropFilter: 'none', // 干渉を避けるため無効化
                    zIndex: 200
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
                        <button
                            onPointerDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                            }}
                            onClick={handleCaptureScreen}
                            className="text-gray-700 hover:bg-gray-100 px-2 min-w-[32px] rounded flex items-center justify-center"
                            title="画面キャプチャ"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                                <circle cx="12" cy="13" r="4"></circle>
                            </svg>
                        </button>
                    </>
                ) : null}
            </div>
        );
    };



    if (!urlPath) {
        return <div className="p-8">No path parameter</div>;
    }

    return (
        <div
            ref={shellRef}
            className="noteShell h-screen overflow-hidden flex flex-col"
            style={{ backgroundColor: noteBackgroundColor, cursor: shellCursor }}
        >
            <style>{`
                /* Scoped Scrollbar Styles */
                .notePaper::-webkit-scrollbar {
                    width: 12px;
                    height: 12px;
                }
                .notePaper::-webkit-scrollbar-track {
                    background: transparent;
                }
                .notePaper::-webkit-scrollbar-thumb {
                    background-color: rgba(0, 0, 0, 0.2);
                    border-radius: 6px;
                    border: 3px solid transparent;
                    background-clip: content-box;
                }
                .notePaper::-webkit-scrollbar-thumb:hover {
                    background-color: rgba(0, 0, 0, 0.5);
                }
            `}</style>

            {/* [NEW] Persistent Sticky Header for Tags & Drag */}
            <header
                onPointerDown={handleHeaderDrag}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (isEditing) {
                        handleEditBlur();
                    } else {
                        handleEditStart(0);
                    }
                }}
                style={{
                    padding: '8px 18px 4px 18px',
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    flexShrink: 0,
                    zIndex: 100,
                    // WebkitAppRegion: 'drag', // [Fix] Remove native drag to prevent maximize
                    cursor: 'move',
                    minHeight: '32px',
                    userSelect: 'none', // ドラッグ優先のため選択解除
                } as any}
            >
                {/* Right: Tag Chips Display & Status */}
                <div style={{
                    display: 'flex',
                    gap: '4px',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'auto',
                    justifyContent: 'flex-end'
                }}>
                    {currentTags.length > 0 && (() => {
                        const MAX_DISPLAY = 5;
                        const displayTags = currentTags.slice(0, MAX_DISPLAY).map(tag =>
                            tag.length > 10 ? tag.substring(0, 10) + '…' : tag
                        );
                        if (currentTags.length > MAX_DISPLAY) {
                            displayTags.push(`+${currentTags.length - MAX_DISPLAY}`);
                        }

                        return displayTags.map((tag, i) => (
                            <span key={i} style={{
                                backgroundColor: 'rgba(0,0,0,0.08)',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                color: 'rgba(0,0,0,0.5)',
                                flexShrink: 0,
                                cursor: 'default'
                            }}>
                                {tag}
                            </span>
                        ));
                    })()}
                    {isEditing && (
                        <span style={{ color: '#ef4444', fontSize: '14px', marginLeft: '6px', alignSelf: 'center' }}>●</span>
                    )}
                </div>
            </header>

            <main
                className="flex-1 overflow-y-auto w-full notePaper noteMain pb-10"
                style={{
                    backgroundColor: noteBackgroundColor,
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '0 18px 12px 18px', // Horizontal 18px matching header
                    boxSizing: 'border-box',
                    position: 'relative',
                    userSelect: isEditing ? 'auto' : 'none' // 閲覧モード時はドラッグ優先
                }}
                onDoubleClick={(e) => {
                    // [Fix] Double Click Behavior:
                    // View Mode -> Edit (Anywhere)
                    // Edit Mode -> View (Outside Textarea)
                    const target = e.target as HTMLElement;
                    if (target.tagName === 'BUTTON' || target.closest('button')) return;

                    // If editing, only close if we didn't click the editor itself (text selection)
                    // The 'main' handles padding clicks.

                    e.stopPropagation();

                    if (isEditing) {
                        // Check if we clicked the editor host (padding area click bubbles here)
                        // If target IS the main container, it's a padding click.
                        if (e.target === e.currentTarget) {
                            handleEditBlur();
                        }
                    } else {
                        handleEditStart(0);
                    }
                }}
            >
                {/* Floating Vertical Toolbar (Pointer events auto to allow clicking) */}
                <div style={{
                    position: 'sticky',
                    top: '0px',
                    right: '0px',
                    zIndex: 200,
                    pointerEvents: 'none',
                    height: 0, // Ensure it doesn't take vertical space
                    display: 'flex',
                    justifyContent: 'flex-end'
                }}>
                    <HoverBar show={isHover} />
                </div>
                {/* The old file-name div is removed/simplified to just a spacer or hidden */}
                {
                    loading ? (
                        <div className="text-center text-gray-300 py-8 text-xs font-mono opacity-30">Loading...</div>
                    ) : isEditing ? (
                        <div
                            className="editorHost notePaper"
                            ref={editorHostRef}
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
                                filePath={selectedFile?.path || ''} // [NEW] Pass file path for image resolution

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
                        <article
                            className="notePaper max-w-none"
                            style={{
                                backgroundColor: noteBackgroundColor,
                                whiteSpace: 'pre-wrap',
                                cursor: isEditing ? 'text' : (isDraggableArea ? 'grab' : 'text'),
                                userSelect: isEditing ? 'auto' : 'none', // 閲覧モード時はドラッグ優先
                                padding: 0, // 親のmainでパディングしているので0にする
                                fontSize: `${noteFontSize}px`, // 設定からのフォントサイズ
                                fontFamily: '"BIZ UDPGothic", "Meiryo", "Yu Gothic UI", sans-serif',
                                lineHeight: '1.4',
                                letterSpacing: '0.01em'
                            }}
                            onPointerDown={handleDragStart} // スムーズなドラッグエンジンを接続
                            // onPointerUp={onArticlePointerUp} // [Deleted] シングルクリック編集開始を削除
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                handleEditStart(0); // [Fix] Force cursor to start
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

                                        const baseOffset = lineOffsets[i] || 0;

                                        if (line.trim() === '') {
                                            return <div key={i} data-line-index={i} style={lineStyle} data-src-start={baseOffset}>&nbsp;</div>;
                                        }

                                        if (line.startsWith('# ')) {
                                            // Heading: start text after "# " (length 2)
                                            return (
                                                <div key={i} data-line-index={i} style={{ ...lineStyle, fontWeight: 700, fontSize: '1.1em' }}>
                                                    {/* [Fix] Hide # in View Mode as requested */}
                                                    <span data-src-start={baseOffset + 2}>
                                                        {renderLineContent(line.substring(2), baseOffset + 2)}
                                                    </span>
                                                </div>
                                            );
                                        }

                                        // チェックボックス (タスクリスト)
                                        const taskMatch = line.match(/^([\-\*\+]\s+\[)([ xX])(\]\s+.*)$/);
                                        if (taskMatch) {
                                            const isChecked = taskMatch[2].toLowerCase() === 'x';

                                            // Calculate offset for the text part
                                            const text = taskMatch[3].substring(2);
                                            const textStart = baseOffset + (line.length - text.length);

                                            return (
                                                <div key={i} data-line-index={i} style={lineStyle}>
                                                    <span
                                                        onClick={(e) => {
                                                            e.stopPropagation(); // 編集モード移行を防ぐ
                                                            handleToggleCheckbox(i);
                                                        }}
                                                        data-interactable="true"
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
                                                        data-src-start={baseOffset} // Icon click -> start of line
                                                    >
                                                        {isChecked ? '☑' : '☐'}
                                                    </span>
                                                    <span
                                                        style={{ textDecoration: isChecked ? 'line-through' : 'none', opacity: isChecked ? 0.6 : 1 }}
                                                        data-src-start={textStart}
                                                    >
                                                        {renderLineContent(text, textStart)}
                                                    </span>
                                                </div>
                                            );
                                        }

                                        // 箇条書き (リスト)
                                        const listMatch = line.match(/^[\-\*\+]\s+(.*)$/);
                                        if (listMatch) {
                                            const text = listMatch[1];
                                            const textStart = baseOffset + (line.length - text.length);
                                            return (
                                                <div key={i} data-line-index={i} style={lineStyle}>
                                                    <span style={{
                                                        marginRight: '8px',
                                                        // color: '#ff8c00', // [Fix] Use default color for bullets
                                                        flexShrink: 0,
                                                        display: 'inline-block',
                                                        width: '1em',
                                                        textAlign: 'center'
                                                    }} data-src-start={baseOffset}>•</span>
                                                    <span data-src-start={textStart}>
                                                        {renderLineContent(text, textStart)}
                                                    </span>
                                                </div>
                                            );
                                        }

                                        // Normal / Bold
                                        // Split by **bold**
                                        const parts = line.split(/(\*\*[^*]+\*\*)/g);
                                        let currentLineCharIdx = 0;

                                        const rendered = parts.map((part, j) => {
                                            if (part === '') return null;

                                            const partStart = baseOffset + currentLineCharIdx;
                                            const partLength = part.length;

                                            if (part.startsWith('**') && part.endsWith('**')) {
                                                const innerText = part.slice(2, -2);
                                                // Update index for next part
                                                currentLineCharIdx += partLength;

                                                return (
                                                    <strong
                                                        key={j}
                                                        style={{ color: 'red', fontWeight: 'bold' }}
                                                        data-src-start={partStart + 2} // Click inside bold -> start of inner text
                                                    >
                                                        {innerText}
                                                    </strong>
                                                );
                                            }

                                            // Update index for next part
                                            currentLineCharIdx += partLength;

                                            return (
                                                <span key={j} data-src-start={partStart}>
                                                    {renderLineContent(part, partStart)}
                                                </span>
                                            );
                                        });

                                        return (
                                            <div key={i} data-line-index={i} style={lineStyle}>
                                                {rendered}
                                            </div>
                                        );
                                    })}
                                </div >
                            ) : (
                                <div className="text-gray-400 text-center py-8 text-xs font-mono opacity-50">
                                    クリックして編集を開始
                                </div>
                            )
                            }
                        </article >
                    )
                }

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
                        userSelect: 'none' // 常に選択不可領域
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
                    onClick={() => isEditing && handleEditBlur()}
                    title="ドラッグで移動 / クリックで保存"
                />
            </main >

            {/* カスタムモーダルダイアログ - 新規タグ追加 */}
            {
                showTagModal && (
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
                )
            }
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
        </div >
    );
});

export default StickyNote;
