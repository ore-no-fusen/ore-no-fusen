/**
 * StickyNote用コンテキストメニュー管理Hook
 * 
 * 責務:
 * - 右クリックメニューの構築と表示
 * - 色変更、アーカイブ、削除、フォルダを開く、タグ操作
 * - コンテキストメニューイベントのリスニング
 */

import { useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { NoteMeta } from '@/app/api/notes';
import { playDeleteSound, playSaveSound } from '../utils/soundManager';
import { TranslationKey } from '@/lib/i18n';

type UseStickyNoteContextMenuProps = {
    selectedFile: NoteMeta | null;
    t: (key: TranslationKey) => string;
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
};

export function useStickyNoteContextMenu({
    selectedFile,
    t,
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
    handleEditBlur
}: UseStickyNoteContextMenuProps) {
    const lastContextMenuPos = useRef<{ x: number; y: number } | null>(null);

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

            // 最新のタグ一覧を取得 (PropsのallTagsだけでなく都度取得して確実性を高める)
            let latestTags = allTags;
            try {
                // インポートが必要: import { getAllTags } from '@/app/api/tags';
                // しかし、このファイルで直接importするより、API呼び出し関数をPropsで受け取るか、
                // あるいはここでもinvokeを使う方が、このフックの依存関係としては疎結合かもしれないが、
                // useTagManagerがラップしているので、getAllTagsをimportして使うのが正攻法。
                // ただしimport追加が面倒なので、invokeを直接呼ぶか、loadAllTagsがPromiseを返すならそれを待つ手もあるが、
                // loadAllTagsはvoid戻り値の可能性もある（確認：Promise<void>だった）。
                // しかしloadAllTagsはstate更新を含むので、ここでのlocal変数には反映されない。
                // よって直接fetchする。
                const fetched = await invoke<string[]>('fusen_get_all_tags');
                if (fetched && Array.isArray(fetched)) {
                    latestTags = fetched;
                    // React側のstateも更新しておく（次回以降のため）
                    loadAllTags();
                }
            } catch (e) {
                console.warn('Failed to fetch latest tags for context menu:', e);
            }

            // 既存タグのトグル
            if (latestTags.length > 0) {
                tagSubItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
                for (const tag of latestTags) {
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
    }, [selectedFile, t, allTags, currentTags, editBody, rawFrontmatter, saveNoteContent, loadAllTags, removeTagFromNote, addTagToNote, handleColorChange, handleOpenFolder/*, isDeletingRef, setShowTagModal, setTagInputValue*/]);


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

    return { showContextMenu };
}
