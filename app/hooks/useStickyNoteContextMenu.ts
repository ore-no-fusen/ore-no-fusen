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
    updateFrontmatter: (key: string, value: any) => void;
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
    updateFrontmatter,
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
                duplicateItem,
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

                if (freshTags.length > 0) {
                    tagSubItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
                    for (const tag of freshTags) {
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
                            loadAllTags();
                            setShowTagModal(true);
                            setTagInputValue('');
                        } catch (e) { console.error('Failed to load tags for new tag modal:', e); }
                    }
                });

                tagSubItems.push(tagNewItem);

                if (freshTags.length > 0) {
                    tagSubItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
                    for (const tag of freshTags) {
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

            // アラーム
            menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
            menuItems.push(await MenuItem.new({
                id: 'ctx_set_alarm',
                text: `⏰ ${t('menu.setAlarm')}`,
                action: () => onSetAlarm()
            }));

            if (iphoneSendEnabled) {
                menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
                menuItems.push(await MenuItem.new({
                    id: 'ctx_send_to_iphone',
                    text: `📱 ${t('menu.sendToIphone')}`,
                    enabled: true,
                    action: async () => {
                        if (!selectedFile) return;
                        // 事前チェック: Google Drive + iPhone push_config が揃っているか
                        const isReady = await invoke<boolean>('fusen_check_pro_setup').catch(() => false);
                        if (!isReady) {
                            // 未設定: 設定画面の iPhone連携タブを開く
                            const { emit } = await import('@tauri-apps/api/event');
                            await emit('fusen:open_settings', { tab: 'iphone' });
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
            }

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

            menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
            if (currentTags.length > 1) {
                // 複数タグ: サブメニューで移動先を選択
                const archiveSubItems: any[] = [];
                for (const tag of currentTags) {
                    archiveSubItems.push(await MenuItem.new({
                        id: `ctx_archive_tag_${tag}`,
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

            menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
            menuItems.push(await MenuItem.new({
                id: 'ctx_open_help',
                text: `❔ ${t('menu.openHelp')}`,
                action: async () => {
                    const { emit } = await import('@tauri-apps/api/event');
                    await emit('fusen:open_settings', { tab: 'help' });
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
    }, [selectedFile, t, currentTags, editBody, rawFrontmatter, saveNoteContent, loadAllTags, removeTagFromNote, addTagToNote, isEditing, onInsertText, isDeletingRef, language, setShowTagModal, setTagInputValue, isTagDeleteMode, setTagToDelete, onSetAlarm, handleColorChange, handleDeleteNote, handleOpenFolder, onToast, resolveCreateFolderPath, iphoneSendEnabled]);


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
