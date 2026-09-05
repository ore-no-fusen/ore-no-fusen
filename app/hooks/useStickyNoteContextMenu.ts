/**
 * StickyNote用コンテキストメニュー管理Hook
 * 
 * 責務:
 * - 右クリックメニューの構築と表示
 * - 色変更、アーカイブ、削除、フォルダを開く、タグ操作
 * - iPhone連携メニュー
 * - コンテキストメニューイベントのリスニング
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { NoteMeta } from '@/app/api/notes';
import { playDeleteSound, playSaveSound } from '../utils/soundManager';
import { TranslationKey, Language } from '@/lib/i18n';
import { getFeedbackConversationUnreadState } from '@/app/utils/feedbackConversation';
import { getUserTags, isReservedTag, normalizeTagForReservation } from '@/app/utils/reservedTags';
import { addTag as addRawTag, removeTag as removeRawTag } from '@/app/api/tags';
import { formatShortcutLabel } from '@/app/utils/shortcutKey';
import { STICKY_ACTION_SYMBOLS } from '@/app/utils/stickyActionSymbols';
import { NOTE_COLORS, NOTE_FONT_SIZES } from '@/app/utils/noteAppearance';
import { formatNewNoteTriggerLabel } from '@/app/utils/newNoteTriggerLabel';
import { trackEvent } from '@/app/utils/analytics';

export async function saveBeforeDuplicate(
    getSnapshot: () => { body: string; frontmatter: string },
    save: (body: string, frontmatter: string) => Promise<void | boolean>,
    duplicate: (snapshot: { body: string; frontmatter: string }) => Promise<void>,
): Promise<void> {
    const snapshot = getSnapshot();
    const saved = await save(snapshot.body, snapshot.frontmatter);
    if (saved === false) return;
    await duplicate(snapshot);
}

export function buildDuplicateRequestPayload(
    path: string,
    snapshot: { body: string; frontmatter: string },
    geometry: {
        sourcePhysX?: number;
        sourcePhysY?: number;
        sourcePhysWidth?: number;
        sourcePhysHeight?: number;
        sourceScale?: number;
    },
) {
    return {
        path,
        snapshotBody: snapshot.body,
        snapshotFrontmatter: snapshot.frontmatter,
        ...geometry,
    };
}

type HotkeyBindings = {
    new_note_trigger: string;
    new_note: string;
    arrange: string;
};

export function getAppOperationMenuLabels(bindings: HotkeyBindings, language: Language) {
    const arrangeShortcut = formatShortcutLabel(bindings.arrange).replace(/ \+ /g, '+');
    if (language === 'en') {
        return {
            submenu: '⚙️ App Actions',
            search: 'Search  Ctrl+F',
            arrange: `Arrange by Tag  ${arrangeShortcut}`,
            undoArrange: 'Undo Arrange',
            settings: 'Settings',
        };
    }
    return {
        submenu: '⚙️ アプリ操作',
        search: '検索  Ctrl+F',
        arrange: `タグで整列  ${arrangeShortcut}`,
        undoArrange: '整列を元に戻す',
        settings: '設定',
    };
}

export function filterAssignableTags(tags: string[]): string[] {
    return getUserTags(tags);
}

type TagContextMenuItemKind = 'tag' | 'tag_del' | 'archive_tag';

export function contextMenuTagItemId(kind: TagContextMenuItemKind, index: number): string {
    return `ctx_${kind}_${index}`;
}

export type ShortcutShelfMenuState = {
    visible: boolean;
    isRegistered: boolean;
    label: string | null;
};

function hasReservedTag(tags: string[], target: 'recipe' | 'shortcut'): boolean {
    return tags.some((tag) => normalizeTagForReservation(tag) === target);
}

export function getShortcutShelfMenuState(tags: string[]): ShortcutShelfMenuState {
    if (hasReservedTag(tags, 'recipe')) {
        return { visible: false, isRegistered: false, label: null };
    }

    const isRegistered = hasReservedTag(tags, 'shortcut');
    return {
        visible: true,
        isRegistered,
        label: isRegistered ? '📌 お気に入りを解除' : '📌 お気に入りに登録',
    };
}

export function getOpenFolderRequest(selectedPath: string | null | undefined, basePath: string | null | undefined) {
    if (selectedPath) {
        return { command: 'fusen_open_containing_folder', path: selectedPath } as const;
    }
    if (basePath) {
        return { command: 'fusen_open_file', path: basePath } as const;
    }
    return null;
}

type UseStickyNoteContextMenuProps = {
    selectedFile: NoteMeta | null;
    isPool: boolean;
    t: (key: TranslationKey) => string;
    language: Language;
    allTags: string[];
    currentTags: string[];
    editBody: string;
    rawFrontmatter: string;
    getCurrentDuplicateSnapshot: () => { body: string; frontmatter: string };
    saveNoteContent: (body: string, front: string, allowRename: boolean) => Promise<boolean>;
    loadAllTags: () => Promise<void>;
    addTagToNote: (path: string, tag: string) => Promise<void>;
    removeTagFromNote: (path: string, tag: string) => Promise<void>;
    isDeletingRef: React.MutableRefObject<boolean>;
    setNoteBackgroundColor: (color: string) => void;
    noteBackgroundColor: string;
    setNoteFontSize: (size: number) => void;
    globalFontSize: number;
    updateFrontmatter: (key: string, value: any) => void;
    removeFrontmatter: (key: string) => void;
    shellRef: React.RefObject<HTMLDivElement | null>;
    setShowTagModal: (show: boolean) => void;
    setTagInputValue: (val: string) => void;
    isEditing: boolean;
    handleEditBlur: () => Promise<void>;
    onInsertText?: (text: string) => void;
    setTagToDelete: (tag: string) => void;
    onSetAlarm: () => void;
    onToast?: (message: string) => void;
    resolveCreateFolderPath: () => Promise<string | null>;
    iphoneSendEnabled: boolean;
};

type TrashMoveResult = {
    moved: boolean;
    path: string;
};

export function releaseDeleteLockWhenMoveIsRejected(
    result: TrashMoveResult,
    isDeletingRef: { current: boolean },
): boolean {
    if (result.moved) return false;
    isDeletingRef.current = false;
    return true;
}

export function useStickyNoteContextMenu({
    selectedFile,
    isPool,
    t,
    language,
    allTags,
    currentTags,
    editBody,
    rawFrontmatter,
    getCurrentDuplicateSnapshot,
    saveNoteContent,
    loadAllTags,
    addTagToNote,
    removeTagFromNote,
    isDeletingRef,
    setNoteBackgroundColor,
    noteBackgroundColor,
    setNoteFontSize,
    globalFontSize,
    updateFrontmatter,
    removeFrontmatter,
    shellRef,
    setShowTagModal,
    setTagInputValue,
    isEditing,
    handleEditBlur,
    onInsertText,
    setTagToDelete,
    onSetAlarm,
    onToast,
    resolveCreateFolderPath,
    iphoneSendEnabled,
}: UseStickyNoteContextMenuProps) {
    const lastContextMenuPos = useRef<{ x: number; y: number } | null>(null);
    const shouldReopenMenu = useRef(false);
    const [isTagDeleteMode, setIsTagDeleteMode] = useState(false);
    // showContextMenu を ref 化: リスナーが showContextMenu の再生成のたびに再登録されるのを防ぐ
    const showContextMenuRef = useRef<(x: number, y: number) => Promise<void>>(() => Promise.resolve());

    // 削除
    const handleDeleteNote = useCallback(async () => {
        // Pool窓（未保存）の場合は selectedFile がnullでもファイル作成前なので削除可能
        if (!selectedFile && !isPool) return;
        // Ctrl+D 連続押下でのダブル削除防止（Tauri destroy() は1回のみ）
        if (isDeletingRef.current) return;
        try {
            isDeletingRef.current = true;
            // selectedFile がある場合のみファイルを削除（Pool未保存窓は対象外）
            if (selectedFile) {
                await saveNoteContent(editBody, rawFrontmatter, false);
                const result = await invoke<TrashMoveResult>('fusen_move_to_trash', { path: selectedFile.path });
                if (releaseDeleteLockWhenMoveIsRejected(result, isDeletingRef)) return;
            }
            await playDeleteSound();
            const win = (await import('@tauri-apps/api/window')).getCurrentWindow();
            await win.hide();
            await win.destroy();
        } catch (e) {
            isDeletingRef.current = false;
            console.error('Failed to delete note:', e);
            alert(language === 'en'
                ? 'Could not delete the note. Please check the save location and try again.'
                : `削除に失敗しました\n${e}`);
        }
    }, [selectedFile, isPool, isDeletingRef, editBody, language, rawFrontmatter, saveNoteContent]);

    // フォルダを開く
    const handleOpenFolder = useCallback(async () => {
        let targetPath = selectedFile?.path ?? '';
        try {
            const basePath = selectedFile ? null : await resolveCreateFolderPath();
            const request = getOpenFolderRequest(selectedFile?.path, basePath);
            if (!request) throw new Error(language === 'en'
                ? 'The data save location is not configured.'
                : '保存先フォルダが設定されていません');
            targetPath = request.path;
            await invoke(request.command, { path: request.path });
        } catch (e) {
            console.error('Failed to open folder:', e);
            alert(language === 'en'
                ? 'Could not open the folder. Please check the data save location.'
                : `フォルダを開けませんでした。\n${targetPath || String(e)}`);
        }
    }, [language, selectedFile, resolveCreateFolderPath]);

    // 背景色変更
    const handleColorChange = useCallback((newColor: string) => {
        console.log('[COLOR] Changing to:', newColor);
        setNoteBackgroundColor(newColor);
        updateFrontmatter('backgroundColor', newColor);
        if (shellRef.current) {
            shellRef.current.style.setProperty('background-color', newColor, 'important');
        }
    }, [updateFrontmatter, setNoteBackgroundColor, shellRef]);

    // 文字サイズ変更（null を渡すとグローバルに戻す）
    const handleFontSizeChange = useCallback((newSize: number | null) => {
        if (newSize === null) {
            setNoteFontSize(globalFontSize);
            removeFrontmatter('fontSize');
        } else {
            setNoteFontSize(newSize);
            updateFrontmatter('fontSize', newSize);
        }
    }, [updateFrontmatter, removeFrontmatter, setNoteFontSize, globalFontSize]);

    // 透明度変更
    const handleOpacityChange = useCallback(async (opacity: number) => {
        try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            await invoke('fusen_set_opacity', {
                windowLabel: getCurrentWindow().label,
                opacity,
            });
            updateFrontmatter('opacity', opacity);
        } catch (e) {
            console.error('Failed to change opacity:', e);
            alert(language === 'en'
                ? 'Could not change the opacity. Please try again.'
                : `透明度の変更に失敗しました\n${e}`);
        }
    }, [language, updateFrontmatter]);

    const handleToggleShortcutShelf = useCallback(async () => {
        if (!selectedFile) return;

        const state = getShortcutShelfMenuState(currentTags);
        if (!state.visible) return;

        if (state.isRegistered) {
            await removeRawTag(selectedFile.path, 'shortcut');
            onToast?.(language === 'en' ? '📌 Removed from Favorites' : '📌 お気に入りを解除しました');
        } else {
            await addRawTag(selectedFile.path, 'shortcut');
            onToast?.(language === 'en' ? '📌 Added to Favorites' : '📌 お気に入りに登録しました');
        }

        const { emit } = await import('@tauri-apps/api/event');
        await emit('fusen:reload_note', { path: selectedFile.path });
    }, [currentTags, language, onToast, selectedFile]);

    /**
     * コンテキストメニュー表示
     */
    const showContextMenu = useCallback(async (x: number, y: number) => {
        if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) {
            return;
        }

        try {
            const { Menu, MenuItem, PredefinedMenuItem, Submenu } = await import('@tauri-apps/api/menu');
            const { LogicalPosition } = await import('@tauri-apps/api/dpi');

            // ============================================================
            // 編集モード用のメニュー
            // ============================================================
            if (isEditing) {
                const now = new Date();
                const pad = (n: number) => n.toString().padStart(2, '0');
                const yyyy = now.getFullYear();
                const mm = pad(now.getMonth() + 1);
                const dd = pad(now.getDate());

                // 曜日を取得
                const weekDay = new Intl.DateTimeFormat(language === 'ja' ? 'ja-JP' : 'en-US', { weekday: 'short' }).format(now);
                // フォーマット: 2026-02-18(水) or 2026-02-18(Wed)
                const dateStrWithDay = `${yyyy}-${mm}-${dd}(${weekDay})`;

                const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

                const items = [
                    await PredefinedMenuItem.new({ item: 'Undo', text: t('menu.undo') || 'Undo' }),
                    await PredefinedMenuItem.new({ item: 'Redo', text: t('menu.redo') || 'Redo' }),
                    await PredefinedMenuItem.new({ item: 'Separator' }),
                    await PredefinedMenuItem.new({ item: 'Cut', text: t('menu.cut') || 'Cut' }),
                    await PredefinedMenuItem.new({ item: 'Copy', text: t('menu.copy') || 'Copy' }),
                    await PredefinedMenuItem.new({ item: 'Paste', text: t('menu.paste') || 'Paste' }),
                    await PredefinedMenuItem.new({ item: 'SelectAll', text: t('menu.selectAll') || 'Select All' }),
                    await PredefinedMenuItem.new({ item: 'Separator' }),
                    await MenuItem.new({
                        id: 'ctx_insert_date_day',
                        text: `📅 ${dateStrWithDay}`,
                        action: () => onInsertText?.(dateStrWithDay)
                    }),
                    await MenuItem.new({
                        id: 'ctx_insert_time',
                        text: `🕒 ${timeStr}`,
                        action: () => onInsertText?.(timeStr)
                    }),
                    await MenuItem.new({
                        id: 'ctx_insert_datetime',
                        text: `📅🕒 ${dateStrWithDay} ${timeStr}`,
                        action: () => onInsertText?.(`${dateStrWithDay} ${timeStr}`)
                    })
                ];

                const menu = await Menu.new({ id: 'editor_context_menu', items });
                await menu.popup(new LogicalPosition(x, y));
                return;
            }

            // ============================================================
            // 閲覧モード用のメニュー（既存）
            // ============================================================

            // メニューオープン時に常に最新のタグ一覧を取得（stale state 回避）
            const [freshTags, hotkeyBindings] = await Promise.all([
                invoke<string[]>('fusen_get_all_tags'),
                invoke<HotkeyBindings>('hotkey_get_bindings').catch(() => ({
                    new_note_trigger: 'shortcut',
                    new_note: 'ctrl+n',
                    arrange: 'ctrl+shift+l',
                })),
            ]);

            // ファイル名アイテム
            const filenameItemPromise = MenuItem.new({
                id: 'ctx_filename',
                text: `📄 ${selectedFile?.path ? selectedFile.path.split(/[/\\]/).pop() : 'Untitled'}`,
                enabled: false
            });

            const separator1Promise = PredefinedMenuItem.new({ item: 'Separator' });

            // フォルダを開く
            const openFolderItemPromise = MenuItem.new({
                id: 'ctx_open_folder',
                text: `📂 ${t('menu.openFolder')}`,
                action: handleOpenFolder
            });

            // 新規メモ作成
            const newNoteItemPromise = MenuItem.new({
                id: 'ctx_new_note',
                text: `${STICKY_ACTION_SYMBOLS.newNote} ${t('menu.newNote')}  ${formatNewNoteTriggerLabel(hotkeyBindings.new_note_trigger, hotkeyBindings.new_note, language)}`,
                action: async () => {
                    try {
                        const { emit } = await import('@tauri-apps/api/event');
                        const { getCurrentWindow } = await import('@tauri-apps/api/window');
                        const folderPath = await resolveCreateFolderPath();
                        if (!folderPath) return;
                        const win = getCurrentWindow();
                        let sourcePhysX: number | undefined;
                        let sourcePhysY: number | undefined;
                        let sourceScale: number | undefined;
                        try {
                            const physPos = await win.outerPosition();
                            sourcePhysX = physPos.x;
                            sourcePhysY = physPos.y;
                            sourceScale = await win.scaleFactor();
                        } catch (_) { /* fallback: no position */ }
                        console.log('[StickyNote] Requesting new note creation via emit', { sourcePhysX, sourcePhysY, sourceScale });
                        await emit('fusen:request_create', { folderPath, context: 'memo', sourcePhysX, sourcePhysY, sourceScale });
                    } catch (e) {
                        console.error('New note request error', e);
                    }
                }
            });

            // 複製
            const duplicateItemPromise = MenuItem.new({
                id: 'ctx_duplicate',
                text: `📋 ${t('menu.duplicate')}`,
                action: async () => {
                    try {
                        if (!selectedFile) return;
                        await saveBeforeDuplicate(
                            getCurrentDuplicateSnapshot,
                            (body, frontmatter) => saveNoteContent(body, frontmatter, false),
                            async (snapshot) => {
                                const { emit } = await import('@tauri-apps/api/event');
                                const { getCurrentWindow } = await import('@tauri-apps/api/window');
                                const win = getCurrentWindow();
                                let sourcePhysX: number | undefined;
                                let sourcePhysY: number | undefined;
                                let sourcePhysWidth: number | undefined;
                                let sourcePhysHeight: number | undefined;
                                let sourceScale: number | undefined;
                                try {
                                    const physPos = await win.outerPosition();
                                    const physSize = await win.outerSize();
                                    sourcePhysX = physPos.x;
                                    sourcePhysY = physPos.y;
                                    sourcePhysWidth = physSize.width;
                                    sourcePhysHeight = physSize.height;
                                    sourceScale = await win.scaleFactor();
                                } catch (_) { }
                                await emit('fusen:request_duplicate', buildDuplicateRequestPayload(selectedFile.path, snapshot, {
                                    sourcePhysX,
                                    sourcePhysY,
                                    sourcePhysWidth,
                                    sourcePhysHeight,
                                    sourceScale,
                                }));
                            },
                        );
                    } catch (e) {
                        console.error('Duplicate note request error', e);
                    }
                }
            });

            const [filenameItem, separator1, openFolderItem, newNoteItem, duplicateItem] = await Promise.all([
                filenameItemPromise,
                separator1Promise,
                openFolderItemPromise,
                newNoteItemPromise,
                duplicateItemPromise,
            ]);

            // 色変更サブメニュー
            const colorItems = await Promise.all([
                MenuItem.new({ id: 'ctx_color_yellow', text: `💛 ${t('menu.colors.yellow')}`, action: () => handleColorChange(NOTE_COLORS.yellow) }),
                MenuItem.new({ id: 'ctx_color_pink', text: `🌸 ${t('menu.colors.pink')}`, action: () => handleColorChange(NOTE_COLORS.pink) }),
                MenuItem.new({ id: 'ctx_color_blue', text: `🔵 ${t('menu.colors.blue')}`, action: () => handleColorChange(NOTE_COLORS.blue) }),
                MenuItem.new({ id: 'ctx_color_white', text: `⬜ ${t('menu.colors.white')}`, action: () => handleColorChange(NOTE_COLORS.white) }),
                MenuItem.new({ id: 'ctx_color_black', text: `⬛ ${t('menu.colors.black')}`, action: () => handleColorChange(NOTE_COLORS.gray) })
            ]);

            // 透明度サブメニュー
            const opacityItems = await Promise.all([
                MenuItem.new({ id: 'ctx_opacity_opaque', text: t('menu.opacity.opaque'), action: () => handleOpacityChange(1.0) }),
                MenuItem.new({ id: 'ctx_opacity_light', text: t('menu.opacity.light'), action: () => handleOpacityChange(0.7) }),
                MenuItem.new({ id: 'ctx_opacity_heavy', text: t('menu.opacity.heavy'), action: () => handleOpacityChange(0.4) })
            ]);

            // 文字サイズサブメニュー
            const fontSizeItems = await Promise.all([
                MenuItem.new({ id: 'ctx_fontsize_reset', text: t('menu.fontSize.reset'), action: () => handleFontSizeChange(null) }),
                MenuItem.new({ id: 'ctx_fontsize_small', text: t('menu.fontSize.small'), action: () => handleFontSizeChange(NOTE_FONT_SIZES.small) }),
                MenuItem.new({ id: 'ctx_fontsize_medium', text: t('menu.fontSize.medium'), action: () => handleFontSizeChange(NOTE_FONT_SIZES.medium) }),
                MenuItem.new({ id: 'ctx_fontsize_large', text: t('menu.fontSize.large'), action: () => handleFontSizeChange(NOTE_FONT_SIZES.large) }),
                MenuItem.new({ id: 'ctx_fontsize_xlarge', text: t('menu.fontSize.xlarge'), action: () => handleFontSizeChange(NOTE_FONT_SIZES.extraLarge) })
            ]);

            const [colorSubmenu, opacitySubmenu, fontSizeSubmenu, separatorCommon, sectionSeparator] = await Promise.all([
                Submenu.new({ id: 'ctx_color_submenu', text: `🎨 ${t('menu.changeColor')}`, items: colorItems }),
                Submenu.new({ id: 'ctx_opacity_submenu', text: `◐ ${t('menu.changeOpacity')}`, items: opacityItems }),
                Submenu.new({ id: 'ctx_fontsize_submenu', text: `📏 ${t('menu.changeFontSize')}`, items: fontSizeItems }),
                PredefinedMenuItem.new({ item: 'Separator' }),
                PredefinedMenuItem.new({ item: 'Separator' }),
            ]);
            const canCreateRecipe = selectedFile?.path && noteBackgroundColor.toLowerCase() === NOTE_COLORS.blue;
            // レシピ付箋では意味がおかしくなる項目（アラーム・タグフォルダへ移動）を出さない
            const isRecipeNote = currentTags.some((tag) => normalizeTagForReservation(tag) === 'recipe');

            // メニュー項目の構築
            let menuItems: any[] = [
                filenameItem,
                separator1,
                openFolderItem,
                sectionSeparator,
                newNoteItem,
                duplicateItem,
                colorSubmenu,
                opacitySubmenu,
                fontSizeSubmenu,
                separatorCommon
            ];

            if (selectedFile?.path) {
                const crystalItems: any[] = [];
                if (canCreateRecipe) {
                    crystalItems.push(await MenuItem.new({
                        id: 'ctx_create_recipe',
                        text: `🍳 ${t('menu.makeRecipe')}`,
                        // 元の付箋の窓に重ねず、専用ウィンドウで開く（元付箋を一切触らない）
                        action: async () => {
                            const p = selectedFile?.path;
                            if (!p) return;
                            try {
                                const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
                                const { emitTo, listen } = await import('@tauri-apps/api/event');
                                const label = 'recipe-create';
                                let existing = await WebviewWindow.getByLabel(label);
                                const { encodeNotePathForUrl } = await import('../utils/pathUtils');
                                if (!existing) {
                                    existing = new WebviewWindow(label, {
                                        url: `/recipe-create?path=${encodeNotePathForUrl(p)}`,
                                        title: language === 'en' ? 'Create Recipe' : 'レシピにする', width: 760, height: 860,
                                        minWidth: 640, minHeight: 620, center: true,
                                        resizable: true, visible: false, focus: false, skipTaskbar: true,
                                        alwaysOnTop: true,
                                    });
                                    await new Promise<void>((resolve, reject) => {
                                        existing!.once('tauri://created', () => resolve());
                                        existing!.once('tauri://error', (e) => reject(e));
                                    });
                                }
                                const hostToken = `recipe-host-${Date.now()}-${Math.random()}`;
                                await new Promise<void>(async (resolve) => {
                                    let settled = false;
                                    const unlisten = await listen<{ token?: string }>('fusen:recipe_draft_host_ready', (event) => {
                                        if (event.payload.token !== hostToken || settled) return;
                                        settled = true;
                                        unlisten();
                                        resolve();
                                    });
                                    const started = Date.now();
                                    while (!settled && Date.now() - started < 2000) {
                                        await emitTo(label, 'fusen:recipe_draft_ping', { token: hostToken }).catch(() => {});
                                        await new Promise((wait) => setTimeout(wait, 25));
                                    }
                                    if (!settled) { settled = true; unlisten(); resolve(); }
                                });
                                const token = `recipe-draft-${Date.now()}-${Math.random()}`;
                                const ready = new Promise<void>(async (resolve) => {
                                    const unlisten = await listen<{ token: string }>('fusen:recipe_draft_ready', (event) => {
                                        if (event.payload.token !== token) return;
                                        unlisten();
                                        resolve();
                                    });
                                    setTimeout(() => { unlisten(); resolve(); }, 3000);
                                });
                                await emitTo(label, 'fusen:prepare_recipe_draft', { path: p, token });
                                await ready;
                                try {
                                    await existing.setAlwaysOnTop(true);
                                } catch (e) {
                                    // 最前面化に失敗しても、レシピ作成そのものは止めない。
                                    console.warn('Failed to keep recipe create window on top', e);
                                }
                                await existing.show();
                                await existing.setSkipTaskbar(false);
                                await existing.setFocus();
                            } catch (e) {
                                console.error('Failed to open recipe create window', e);
                            }
                        }
                    }));
                }
                crystalItems.push(await MenuItem.new({
                    id: 'ctx_create_qa',
                    text: `❓ ${t('menu.makeQa')}`,
                    // 元の付箋の窓に重ねず、専用ウィンドウで開く（元付箋を一切触らない）
                    action: async () => {
                        const p = selectedFile?.path;
                        if (!p) return;
                        try {
                            const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
                            const label = 'qa-create';
                            const existing = await WebviewWindow.getByLabel(label);
                            if (existing) { await existing.setFocus(); return; }
                            const { encodeNotePathForUrl } = await import('../utils/pathUtils');
                            const w = new WebviewWindow(label, {
                                url: `/qa-create?path=${encodeNotePathForUrl(p)}`,
                                title: language === 'en' ? 'Create Q&A' : 'QAにする',
                                width: 760,
                                height: 860,
                                minWidth: 640,
                                minHeight: 620,
                                center: true,
                                resizable: true,
                                focus: true,
                            });
                            w.once('tauri://error', (e) => console.error('[qa-create] window error', e));
                        } catch (e) {
                            console.error('Failed to open QA create window', e);
                        }
                    }
                }));
                crystalItems.push(await MenuItem.new({
                    id: 'ctx_create_term',
                    text: `📖 ${t('menu.makeTerm')}`,
                    // 元の付箋の窓に重ねず、専用ウィンドウで開く（元付箋を一切触らない）
                    action: async () => {
                        const p = selectedFile?.path;
                        if (!p) return;
                        try {
                            const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
                            const label = 'term-create';
                            const existing = await WebviewWindow.getByLabel(label);
                            if (existing) { await existing.setFocus(); return; }
                            const { encodeNotePathForUrl } = await import('../utils/pathUtils');
                            const w = new WebviewWindow(label, {
                                url: `/term-create?path=${encodeNotePathForUrl(p)}`,
                                title: language === 'en' ? 'Create Term' : '用語にする',
                                width: 760,
                                height: 860,
                                minWidth: 640,
                                minHeight: 620,
                                center: true,
                                resizable: true,
                                focus: true,
                            });
                            w.once('tauri://error', (e) => console.error('[term-create] window error', e));
                        } catch (e) {
                            console.error('Failed to open term create window', e);
                        }
                    }
                }));
                menuItems.push(await Submenu.new({
                    id: 'ctx_crystal_submenu',
                    text: `💎 ${t('menu.crystallize')}`,
                    items: crystalItems
                }));
                menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
            }

            // タグサブメニューの構築
            let tagSubItems: any[] = [];

            const shortcutShelfMenuState = getShortcutShelfMenuState(currentTags);
            if (selectedFile && shortcutShelfMenuState.visible && shortcutShelfMenuState.label) {
                menuItems.push(await MenuItem.new({
                    id: 'ctx_shortcut_shelf',
                    text: `📌 ${shortcutShelfMenuState.isRegistered ? t('menu.favoriteRemove') : t('menu.favoriteAdd')}`,
                    action: handleToggleShortcutShelf
                }));
                menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
            }

            if (isTagDeleteMode) {
                // =============== 削除モード ===============
                tagSubItems.push(await MenuItem.new({ id: 'header_del', text: `🗑️ ${t('menu.tagDeleteHint')}`, enabled: false }));
                tagSubItems.push(await MenuItem.new({
                    id: 'ctx_exit_mode',
                    text: `🔙 ${t('menu.tagDeleteBack')}`,
                    action: () => {
                        shouldReopenMenu.current = true;
                        setIsTagDeleteMode(false);
                    }
                }));

                const deletableTags = filterAssignableTags(freshTags);
                if (deletableTags.length > 0) {
                    tagSubItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
                    const deleteTagItems = await Promise.all(deletableTags.map((tag, index) =>
                        MenuItem.new({
                            id: contextMenuTagItemId('tag_del', index),
                            text: `❌ ${tag}`,
                            action: () => {
                                setTagToDelete(tag);
                            }
                        })
                    ));
                    tagSubItems.push(...deleteTagItems);
                }
            } else {
                // =============== 通常モード ===============
                const tagNewItem = await MenuItem.new({
                    id: 'ctx_tag_new',
                    text: `➕ ${t('menu.addTag')}`,
                    action: async () => {
                        try {
                            loadAllTags();
                            setShowTagModal(true);
                            setTagInputValue('');
                        } catch (e) { console.error('Failed to load tags for new tag modal:', e); }
                    }
                });

                tagSubItems.push(tagNewItem);

                const assignableTags = filterAssignableTags(freshTags);

                if (assignableTags.length > 0) {
                    tagSubItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
                    const assignTagItems = await Promise.all(assignableTags.map((tag, index) => {
                        const isChecked = currentTags.includes(tag);
                        return MenuItem.new({
                            id: contextMenuTagItemId('tag', index),
                            text: isChecked ? `☑ ${tag}` : `☐ ${tag}`,
                            action: async () => {
                                if (!selectedFile) return;
                                if (isChecked) {
                                    await removeTagFromNote(selectedFile.path, tag);
                                } else {
                                    await addTagToNote(selectedFile.path, tag);
                                }
                                await import('@tauri-apps/api/event').then(({ emit }) => {
                                    emit('fusen:reload_note', { path: selectedFile.path });
                                });
                            }
                        });
                    }));
                    tagSubItems.push(...assignTagItems);
                    tagSubItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
                    tagSubItems.push(await MenuItem.new({
                        id: 'ctx_enter_del_mode',
                        text: `🗑️ ${t('menu.tagDeleteStart')}`,
                        action: () => {
                            shouldReopenMenu.current = true;
                            setIsTagDeleteMode(true);
                        }
                    }));
                }
            }

            const tagSubmenu = await Submenu.new({ id: 'ctx_tags_submenu', text: `🏷️ ${t('menu.tags')}`, items: tagSubItems });
            menuItems.push(tagSubmenu);

            // アラーム（レシピ付箋には出さない）
            if (!isRecipeNote) {
                menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
                menuItems.push(await MenuItem.new({
                    id: 'ctx_set_alarm',
                    text: `⏰ ${t('menu.setAlarm')}`,
                    action: () => onSetAlarm()
                }));
            }

            menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
            menuItems.push(await MenuItem.new({
                id: 'ctx_send_to_iphone',
                text: `📱 ${t('menu.sendToIphone')}`,
                enabled: true,
                action: async () => {
                    if (!selectedFile) return;
                    const openIphoneSettings = async () => {
                        const { emit } = await import('@tauri-apps/api/event');
                        await emit('fusen:open_settings', { tab: 'iphone' });
                    };

                    if (!iphoneSendEnabled) {
                        await openIphoneSettings();
                        return;
                    }

                    // 事前チェック: Google Drive + iPhone push_config が揃っているか
                    const isReady = await invoke<boolean>('fusen_check_pro_setup').catch(() => false);
                    if (!isReady) {
                        // 未設定: 設定画面の iPhone連携タブを開く
                        await openIphoneSettings();
                        return;
                    }
                    try {
                        await invoke('fusen_send_to_iphone', { path: selectedFile.path });
                        trackEvent('feature_used', { event_category: 'usage', feature_name: 'iphone_send' });
                        onToast?.(language === 'en' ? '📱 Sent to iPhone' : '📱 iPhoneに送りました');
                    } catch (e: unknown) {
                        console.error('[iPhone] Send failed detail:', e);
                        alert(language === 'en'
                            ? 'Could not send the note to iPhone. Check iPhone Sync in Settings and try again.'
                            : `iPhoneへの送信に失敗しました: ${String(e)}`);
                    }
                }
            }));

            // アーカイブ
            const doArchive = async (targetTag?: string) => {
                try {
                    if (!selectedFile) return;
                    isDeletingRef.current = true;
                    await saveNoteContent(editBody, rawFrontmatter, false);
                    void playSaveSound();
                    await invoke('fusen_archive_note', { path: selectedFile.path, targetTag: targetTag ?? null });
                    trackEvent('feature_used', { event_category: 'usage', feature_name: 'note_archive' });
                    const win = (await import('@tauri-apps/api/window')).getCurrentWindow();
                    await win.hide();
                    await win.destroy();
                } catch (e) {
                    isDeletingRef.current = false;
                    console.error('Failed to archive note:', e);
                    alert(`${t('menu.archive_failed')}\n${e}`);
                }
            };

            // タグフォルダへ移動（レシピ付箋には出さない。Recipes/ から連れ出して棚が壊れるため）
            if (!isRecipeNote) {
            menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
            const archiveTags = getUserTags(currentTags);
            if (archiveTags.length > 1) {
                // 複数タグ: サブメニューで移動先を選択
                const archiveSubItems: any[] = [];
                const archiveTagItems = await Promise.all(archiveTags.map((tag, index) =>
                    MenuItem.new({
                        id: contextMenuTagItemId('archive_tag', index),
                        text: `🏷️ ${tag}`,
                        action: () => doArchive(tag)
                    })
                ));
                archiveSubItems.push(...archiveTagItems);
                archiveSubItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
                archiveSubItems.push(await MenuItem.new({
                    id: 'ctx_archive_no_tag',
                    text: `📁 ${t('menu.archiveWithoutTag')}`,
                    action: () => doArchive(undefined)
                }));
                menuItems.push(await Submenu.new({
                    id: 'ctx_archive_submenu',
                    text: `${STICKY_ACTION_SYMBOLS.archive} ${t('menu.archive')}`,
                    items: archiveSubItems
                }));
            } else {
                // 0 or 1タグ: 従来通り直接実行
                menuItems.push(await MenuItem.new({
                    id: 'ctx_archive',
                    text: `${STICKY_ACTION_SYMBOLS.archive} ${t('menu.archive')}`,
                    action: () => doArchive()
                }));
            }
            }

            const appOperationLabels = getAppOperationMenuLabels(hotkeyBindings, language);
            const appOperationItems = await Promise.all([
                MenuItem.new({
                    id: 'ctx_app_search',
                    text: appOperationLabels.search,
                    action: async () => {
                        const { emit } = await import('@tauri-apps/api/event');
                        await emit('fusen:open_search');
                    },
                }),
                MenuItem.new({
                    id: 'ctx_app_arrange',
                    text: appOperationLabels.arrange,
                    action: () => invoke('fusen_arrange_by_tag'),
                }),
                MenuItem.new({
                    id: 'ctx_app_arrange_undo',
                    text: appOperationLabels.undoArrange,
                    action: () => invoke('fusen_arrange_undo'),
                }),
                PredefinedMenuItem.new({ item: 'Separator' }),
                MenuItem.new({
                    id: 'ctx_app_settings',
                    text: appOperationLabels.settings,
                    action: async () => {
                        const { emit } = await import('@tauri-apps/api/event');
                        await emit('fusen:open_settings', {});
                    },
                }),
            ]);
            const appOperationSubmenu = await Submenu.new({
                id: 'ctx_app_operations',
                text: appOperationLabels.submenu,
                items: appOperationItems,
            });

            menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
            menuItems.push(appOperationSubmenu);
            menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
            menuItems.push(await MenuItem.new({
                id: 'ctx_open_help',
                text: `${STICKY_ACTION_SYMBOLS.help} ${t('menu.openHelp')}`,
                action: async () => {
                    const { emit } = await import('@tauri-apps/api/event');
                    await emit('fusen:open_settings', { tab: 'help' });
                }
            }));
            menuItems.push(await MenuItem.new({
                id: 'ctx_open_developer_conversation',
                text: getFeedbackConversationUnreadState()
                    ? `📨 ${t('menu.developerConversation')}  ● ${t('menu.newMessage')}`
                    : `📨 ${t('menu.developerConversation')}`,
                action: async () => {
                    const { emit } = await import('@tauri-apps/api/event');
                    await emit('fusen:open_settings', { tab: 'conversation' });
                }
            }));

            // 削除
            menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
            menuItems.push(await MenuItem.new({
                id: 'ctx_delete',
                text: `${STICKY_ACTION_SYMBOLS.delete} ${t('menu.delete')}  Ctrl+D`,
                action: handleDeleteNote
            }));


            const menu = await Menu.new({ id: 'context_menu', items: menuItems });
            await menu.popup(new LogicalPosition(x, y));

        } catch (e) {
            console.error('Failed to show context menu', e);
        }
    }, [selectedFile, t, currentTags, editBody, rawFrontmatter, getCurrentDuplicateSnapshot, saveNoteContent, loadAllTags, removeTagFromNote, addTagToNote, isEditing, onInsertText, isDeletingRef, language, setShowTagModal, setTagInputValue, isTagDeleteMode, setTagToDelete, onSetAlarm, handleColorChange, handleOpacityChange, handleDeleteNote, handleOpenFolder, onToast, resolveCreateFolderPath, iphoneSendEnabled, handleFontSizeChange, noteBackgroundColor, handleToggleShortcutShelf]);


    // ref を常に最新の showContextMenu に同期（リスナー内から呼ぶため）
    useEffect(() => { showContextMenuRef.current = showContextMenu; }, [showContextMenu]);

    // 右クリックイベントリスナー（deps を [] にして不要な再登録を防ぐ）
    useEffect(() => {
        const handleContextMenu = async (e: MouseEvent) => {
            e.preventDefault();
            lastContextMenuPos.current = { x: e.clientX, y: e.clientY };
            await showContextMenuRef.current(e.clientX, e.clientY);
            console.log('[ContextMenu] Right click detected');
        };

        window.addEventListener('contextmenu', handleContextMenu);
        return () => window.removeEventListener('contextmenu', handleContextMenu);
    }, []); // showContextMenu は ref 経由で参照するため deps 不要

    // モード切り替えによるメニューの再表示
    useEffect(() => {
        if (shouldReopenMenu.current) {
            shouldReopenMenu.current = false;
            setTimeout(() => {
                const pos = lastContextMenuPos.current;
                if (pos) {
                    showContextMenuRef.current(pos.x, pos.y);
                }
            }, 50);
        }
    }, [isTagDeleteMode]); // showContextMenu は ref 経由

    return { showContextMenu, handleDeleteNote };
}
