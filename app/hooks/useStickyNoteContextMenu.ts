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
import { LAUNCHER_SHELF_CHANGED_EVENT } from '@/app/utils/launcherEvents';
import { isReservedTag, normalizeTagForReservation } from '@/app/utils/reservedTags';
import { addTag as addRawTag, removeTag as removeRawTag } from '@/app/api/tags';

export function filterAssignableTags(tags: string[]): string[] {
    return tags.filter((tag) => !isReservedTag(tag));
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

type UseStickyNoteContextMenuProps = {
    selectedFile: NoteMeta | null;
    isPool: boolean;
    t: (key: TranslationKey) => string;
    language: Language;
    allTags: string[];
    currentTags: string[];
    editBody: string;
    rawFrontmatter: string;
    saveNoteContent: (body: string, front: string, allowRename: boolean) => Promise<void>;
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
    shellRef: React.RefObject<HTMLDivElement>;
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

export function useStickyNoteContextMenu({
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
            await playDeleteSound();
            // selectedFile がある場合のみファイルを削除（Pool未保存窓は対象外）
            if (selectedFile) {
                await invoke('fusen_move_to_trash', { path: selectedFile.path });
            }
            const win = (await import('@tauri-apps/api/window')).getCurrentWindow();
            await win.hide();
            await win.destroy();
        } catch (e) {
            isDeletingRef.current = false;
            console.error('Failed to delete note:', e);
            alert(`削除に失敗しました\n${e}`);
        }
    }, [selectedFile, isPool, isDeletingRef]);

    // フォルダを開く
    const handleOpenFolder = useCallback(async () => {
        if (!selectedFile) return;
        try {
            await invoke('fusen_open_containing_folder', { path: selectedFile.path });
        } catch (e) {
            console.error('Failed to open folder:', e);
            alert(`フォルダを開けませんでした。\n${selectedFile.path}`);
        }
    }, [selectedFile]);

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
            alert(`透明度の変更に失敗しました\n${e}`);
        }
    }, [updateFrontmatter]);

    const handleToggleShortcutShelf = useCallback(async () => {
        if (!selectedFile) return;

        const state = getShortcutShelfMenuState(currentTags);
        if (!state.visible) return;

        if (state.isRegistered) {
            await removeRawTag(selectedFile.path, 'shortcut');
            onToast?.('📌 お気に入りを解除しました');
        } else {
            await addRawTag(selectedFile.path, 'shortcut');
            onToast?.('📌 お気に入りに登録しました');
        }

        const { emit } = await import('@tauri-apps/api/event');
        await emit('fusen:reload_note', { path: selectedFile.path });
        await emit(LAUNCHER_SHELF_CHANGED_EVENT);
    }, [currentTags, onToast, selectedFile]);

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
            const freshTags = await invoke<string[]>('fusen_get_all_tags');

            // ファイル名アイテム
            const filenameItem = await MenuItem.new({
                id: 'ctx_filename',
                text: `📄 ${selectedFile?.path ? selectedFile.path.split(/[/\\]/).pop() : 'Untitled'}`,
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
                text: `✨ ${t('menu.newNote')}  Ctrl+N`,
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
            const duplicateItem = await MenuItem.new({
                id: 'ctx_duplicate',
                text: `📋 複製`,
                action: async () => {
                    try {
                        if (!selectedFile) return;
                        const { emit } = await import('@tauri-apps/api/event');
                        const { getCurrentWindow } = await import('@tauri-apps/api/window');
                        const win = getCurrentWindow();
                        let sourcePhysX: number | undefined;
                        let sourcePhysY: number | undefined;
                        let sourceScale: number | undefined;
                        try {
                            const physPos = await win.outerPosition();
                            sourcePhysX = physPos.x;
                            sourcePhysY = physPos.y;
                            sourceScale = await win.scaleFactor();
                        } catch (_) { }
                        await emit('fusen:request_duplicate', { path: selectedFile.path, sourcePhysX, sourcePhysY, sourceScale });
                    } catch (e) {
                        console.error('Duplicate note request error', e);
                    }
                }
            });

            // 色変更サブメニュー
            const colorItems = [
                await MenuItem.new({ id: 'ctx_color_yellow', text: `💛 ${t('menu.colors.yellow')}`, action: () => handleColorChange('#f7e9b0') }),
                await MenuItem.new({ id: 'ctx_color_pink', text: `🌸 ${t('menu.colors.pink')}`, action: () => handleColorChange('#ffcdd2') }),
                await MenuItem.new({ id: 'ctx_color_blue', text: `🔵 ${t('menu.colors.blue')}`, action: () => handleColorChange('#80d8ff') }),
                await MenuItem.new({ id: 'ctx_color_white', text: `⬜ ${t('menu.colors.white')}`, action: () => handleColorChange('#fafaf0') }),
                await MenuItem.new({ id: 'ctx_color_black', text: `⬛ ${t('menu.colors.black')}`, action: () => handleColorChange('#cfd8dc') })
            ];
            const colorSubmenu = await Submenu.new({ id: 'ctx_color_submenu', text: `🎨 ${t('menu.changeColor')}`, items: colorItems });

            // 透明度サブメニュー
            const opacityItems = [
                await MenuItem.new({ id: 'ctx_opacity_opaque', text: t('menu.opacity.opaque'), action: () => handleOpacityChange(1.0) }),
                await MenuItem.new({ id: 'ctx_opacity_light', text: t('menu.opacity.light'), action: () => handleOpacityChange(0.7) }),
                await MenuItem.new({ id: 'ctx_opacity_heavy', text: t('menu.opacity.heavy'), action: () => handleOpacityChange(0.4) })
            ];
            const opacitySubmenu = await Submenu.new({ id: 'ctx_opacity_submenu', text: t('menu.changeOpacity'), items: opacityItems });

            // 文字サイズサブメニュー
            const fontSizeItems = [
                await MenuItem.new({ id: 'ctx_fontsize_reset', text: t('menu.fontSize.reset'), action: () => handleFontSizeChange(null) }),
                await MenuItem.new({ id: 'ctx_fontsize_small', text: t('menu.fontSize.small'), action: () => handleFontSizeChange(12) }),
                await MenuItem.new({ id: 'ctx_fontsize_medium', text: t('menu.fontSize.medium'), action: () => handleFontSizeChange(16) }),
                await MenuItem.new({ id: 'ctx_fontsize_large', text: t('menu.fontSize.large'), action: () => handleFontSizeChange(20) }),
                await MenuItem.new({ id: 'ctx_fontsize_xlarge', text: t('menu.fontSize.xlarge'), action: () => handleFontSizeChange(28) })
            ];
            const fontSizeSubmenu = await Submenu.new({ id: 'ctx_fontsize_submenu', text: `📏 ${t('menu.changeFontSize')}`, items: fontSizeItems });

            const separatorCommon = await PredefinedMenuItem.new({ item: 'Separator' });
            const canCreateRecipe = selectedFile?.path && noteBackgroundColor.toLowerCase() === '#80d8ff';
            // レシピ付箋では意味がおかしくなる項目（アラーム・タグフォルダへ移動）を出さない
            const isRecipeNote = currentTags.some((tag) => normalizeTagForReservation(tag) === 'recipe');

            // メニュー項目の構築
            let menuItems: any[] = [
                filenameItem,
                separator1,
                openFolderItem,
                await PredefinedMenuItem.new({ item: 'Separator' }),
                newNoteItem,
                duplicateItem,
                colorSubmenu,
                opacitySubmenu,
                fontSizeSubmenu,
                separatorCommon
            ];

            if (canCreateRecipe) {
                menuItems.push(await Submenu.new({
                    id: 'ctx_crystal_submenu',
                    text: '💎 結晶にする',
                    items: [
                        await MenuItem.new({
                            id: 'ctx_create_recipe',
                            text: '🍳 レシピにする',
                            // 元の付箋の窓に重ねず、専用ウィンドウで開く（元付箋を一切触らない）
                            action: async () => {
                                const p = selectedFile?.path;
                                if (!p) return;
                                try {
                                    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
                                    const label = 'recipe-create';
                                    const existing = await WebviewWindow.getByLabel(label);
                                    if (existing) { await existing.setFocus(); return; }
                                    const { encodeNotePathForUrl } = await import('../utils/pathUtils');
                                    const w = new WebviewWindow(label, {
                                        url: `/recipe-create?path=${encodeNotePathForUrl(p)}`,
                                        title: 'レシピにする',
                                        width: 760,
                                        height: 860,
                                        minWidth: 640,
                                        minHeight: 620,
                                        center: true,
                                        resizable: true,
                                        focus: true,
                                    });
                                    w.once('tauri://error', (e) => console.error('[recipe-create] window error', e));
                                } catch (e) {
                                    console.error('Failed to open recipe create window', e);
                                }
                            }
                        })
                    ]
                }));
                menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
            }

            // タグサブメニューの構築
            let tagSubItems: any[] = [];

            const shortcutShelfMenuState = getShortcutShelfMenuState(currentTags);
            if (selectedFile && shortcutShelfMenuState.visible && shortcutShelfMenuState.label) {
                menuItems.push(await MenuItem.new({
                    id: 'ctx_shortcut_shelf',
                    text: shortcutShelfMenuState.label,
                    action: handleToggleShortcutShelf
                }));
                menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
            }

            if (isTagDeleteMode) {
                // =============== 削除モード ===============
                tagSubItems.push(await MenuItem.new({ id: 'header_del', text: '🗑️ 削除モード (タグを選択して削除)', enabled: false }));
                tagSubItems.push(await MenuItem.new({
                    id: 'ctx_exit_mode',
                    text: '🔙 通常モードに戻る',
                    action: () => {
                        shouldReopenMenu.current = true;
                        setIsTagDeleteMode(false);
                    }
                }));

                if (freshTags.length > 0) {
                    tagSubItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
                    for (const [index, tag] of freshTags.entries()) {
                        tagSubItems.push(await MenuItem.new({
                            id: contextMenuTagItemId('tag_del', index),
                            text: `❌ ${tag}`,
                            action: () => {
                                setTagToDelete(tag);
                            }
                        }));
                    }
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
                    for (const [index, tag] of assignableTags.entries()) {
                        const isChecked = currentTags.includes(tag);
                        tagSubItems.push(await MenuItem.new({
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
                        }));
                    }
                    tagSubItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
                    tagSubItems.push(await MenuItem.new({
                        id: 'ctx_enter_del_mode',
                        text: '🗑️ 削除モードにする',
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
                        onToast?.('📱 iPhoneに送りました');
                    } catch (e: unknown) {
                        alert(`iPhoneへの送信に失敗しました: ${String(e)}`);
                    }
                }
            }));

            // アーカイブ
            const doArchive = async (targetTag?: string) => {
                try {
                    if (!selectedFile) return;
                    isDeletingRef.current = true;
                    await saveNoteContent(editBody, rawFrontmatter, false);
                    await playSaveSound();
                    await invoke('fusen_archive_note', { path: selectedFile.path, targetTag: targetTag ?? null });
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
            if (currentTags.length > 1) {
                // 複数タグ: サブメニューで移動先を選択
                const archiveSubItems: any[] = [];
                for (const [index, tag] of currentTags.entries()) {
                    archiveSubItems.push(await MenuItem.new({
                        id: contextMenuTagItemId('archive_tag', index),
                        text: `🏷️ ${tag}`,
                        action: () => doArchive(tag)
                    }));
                }
                archiveSubItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
                archiveSubItems.push(await MenuItem.new({
                    id: 'ctx_archive_no_tag',
                    text: `📁 Archive（タグなし）`,
                    action: () => doArchive(undefined)
                }));
                menuItems.push(await Submenu.new({
                    id: 'ctx_archive_submenu',
                    text: `📦 ${t('menu.archive')}`,
                    items: archiveSubItems
                }));
            } else {
                // 0 or 1タグ: 従来通り直接実行
                menuItems.push(await MenuItem.new({
                    id: 'ctx_archive',
                    text: `📦 ${t('menu.archive')}`,
                    action: () => doArchive()
                }));
            }
            }

            menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
            menuItems.push(await MenuItem.new({
                id: 'ctx_open_help',
                text: `❔ ${t('menu.openHelp')}`,
                action: async () => {
                    const { emit } = await import('@tauri-apps/api/event');
                    await emit('fusen:open_settings', { tab: 'help' });
                }
            }));
            menuItems.push(await MenuItem.new({
                id: 'ctx_open_developer_conversation',
                text: getFeedbackConversationUnreadState()
                    ? '📨 開発者とのやりとり  ● 新着あり'
                    : '📨 開発者とのやりとり',
                action: async () => {
                    const { emit } = await import('@tauri-apps/api/event');
                    await emit('fusen:open_settings', { tab: 'conversation' });
                }
            }));

            // 削除
            menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
            menuItems.push(await MenuItem.new({
                id: 'ctx_delete',
                text: `🗑️ ${t('menu.delete')}  Ctrl+D`,
                action: handleDeleteNote
            }));


            const menu = await Menu.new({ id: 'context_menu', items: menuItems });
            await menu.popup(new LogicalPosition(x, y));

        } catch (e) {
            console.error('Failed to show context menu', e);
        }
    }, [selectedFile, t, currentTags, editBody, rawFrontmatter, saveNoteContent, loadAllTags, removeTagFromNote, addTagToNote, isEditing, onInsertText, isDeletingRef, language, setShowTagModal, setTagInputValue, isTagDeleteMode, setTagToDelete, onSetAlarm, handleColorChange, handleOpacityChange, handleDeleteNote, handleOpenFolder, onToast, resolveCreateFolderPath, iphoneSendEnabled, handleFontSizeChange, noteBackgroundColor, handleToggleShortcutShelf]);


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
