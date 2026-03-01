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

type UseStickyNoteContextMenuProps = {
    selectedFile: NoteMeta | null;
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
    updateFrontmatter: (key: string, value: any) => void;
    shellRef: React.RefObject<HTMLDivElement>;
    setShowTagModal: (show: boolean) => void;
    setTagInputValue: (val: string) => void;
    isEditing: boolean;
    handleEditBlur: () => Promise<void>;
    onInsertText?: (text: string) => void;
    setTagToDelete: (tag: string) => void;
};

export function useStickyNoteContextMenu({
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
    onInsertText,
    setTagToDelete
}: UseStickyNoteContextMenuProps) {
    const lastContextMenuPos = useRef<{ x: number; y: number } | null>(null);
    const shouldReopenMenu = useRef(false);
    const [isTagDeleteMode, setIsTagDeleteMode] = useState(false);

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
    }, [updateFrontmatter, setNoteBackgroundColor, shellRef]);

    /**
     * コンテキストメニュー表示
     */
    const showContextMenu = useCallback(async (x: number, y: number) => {
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
                text: `✨ ${t('menu.newNote')}`,
                action: async () => {
                    try {
                        if (!selectedFile) return;
                        const { emit } = await import('@tauri-apps/api/event');
                        const { getCurrentWindow } = await import('@tauri-apps/api/window');
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
                        } catch (_) { /* fallback: no position */ }
                        console.log('[StickyNote] Requesting new note creation via emit', { sourcePhysX, sourcePhysY, sourceScale });
                        await emit('fusen:request_create', { folderPath, context: 'memo', sourcePhysX, sourcePhysY, sourceScale });
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

            // タグサブメニューの構築
            let tagSubItems: any[] = [];

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

                if (allTags.length > 0) {
                    tagSubItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
                    for (const tag of allTags) {
                        tagSubItems.push(await MenuItem.new({
                            id: `ctx_tag_del_${tag}`,
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
                            const tags = await invoke<string[]>('fusen_get_all_tags');
                            loadAllTags();
                            setShowTagModal(true);
                            setTagInputValue('');
                        } catch (e) { console.error('Failed to load tags for new tag modal:', e); }
                    }
                });

                tagSubItems.push(tagNewItem);

                if (allTags.length > 0) {
                    tagSubItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
                    for (const tag of allTags) {
                        const isChecked = currentTags.includes(tag);
                        tagSubItems.push(await MenuItem.new({
                            id: `ctx_tag_${tag}`,
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

            // iPhoneに表示（将来実装予定）
            menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
            menuItems.push(await MenuItem.new({
                id: 'ctx_send_to_iphone',
                text: `📱 ${t('menu.sendToIphone')}`,
                enabled: false,
                action: async () => {}
            }));

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
                        await win.hide();
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
                        await win.hide();
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
    }, [selectedFile, t, allTags, currentTags, editBody, rawFrontmatter, saveNoteContent, loadAllTags, removeTagFromNote, addTagToNote, isEditing, onInsertText, isDeletingRef, language, setShowTagModal, setTagInputValue, isTagDeleteMode, setTagToDelete]);


    // 右クリックイベントリスナー
    useEffect(() => {
        const handleContextMenu = async (e: MouseEvent) => {
            e.preventDefault();
            if (!isEditing) {
                // 閲覧モード時の処理
            }
            lastContextMenuPos.current = { x: e.clientX, y: e.clientY };
            await showContextMenu(e.clientX, e.clientY);
            console.log('[ContextMenu] Right click detected');
        };

        window.addEventListener('contextmenu', handleContextMenu);
        return () => window.removeEventListener('contextmenu', handleContextMenu);
    }, [isEditing, handleEditBlur, showContextMenu]);

    // モード切り替えによるメニューの再表示
    useEffect(() => {
        if (shouldReopenMenu.current) {
            shouldReopenMenu.current = false;
            setTimeout(() => {
                const pos = lastContextMenuPos.current;
                if (pos) {
                    showContextMenu(pos.x, pos.y);
                }
            }, 50);
        }
    }, [isTagDeleteMode, showContextMenu]);

    return { showContextMenu };
}
