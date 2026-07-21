'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
    getLauncherState,
    openQuickNote,
    quickOpenNotes,
    QuickOpenItem,
    LauncherTab,
    removeFromShelf,
    renameQuickNote,
    reorderQuickNote,
    setLauncherLastTab,
    setLauncherTagFilter,
} from '../api/launcher';
import { truncateRecipeName } from '../utils/recipeFormat';
import { getUserTags } from '../utils/reservedTags';
import PinTackIcon from './PinTackIcon';
import { playPinToggleSound } from '../utils/pinToggleSound';
import { LAUNCHER_SHELF_CHANGED_EVENT, shouldReloadLauncherForEvent } from '../utils/launcherEvents';
import { useSettings } from '@/lib/settings-store';
import type { Language } from '@/lib/i18n';

type LauncherTabConfig = {
    key: LauncherTab;
    label: string;
};

type ContextMenuState = {
    x: number;
    y: number;
    item: QuickOpenItem;
} | null;

export const LAUNCHER_TABS: LauncherTabConfig[] = [
    { key: 'shortcut', label: 'お気に入り' },
    { key: 'qa', label: 'QA' },
    { key: 'term', label: '用語集' },
    { key: 'recipe', label: '手順' },
];

export function isLauncherTab(value: string | undefined | null): value is LauncherTab {
    return value === 'shortcut' || value === 'qa' || value === 'term' || value === 'recipe';
}

export function normalizeLauncherTab(value: string | undefined | null): LauncherTab {
    return isLauncherTab(value) ? value : 'recipe';
}

export function tabToReservedTag(tab: LauncherTab): LauncherTab {
    return tab;
}

export function emptyMessageForTab(tab: LauncherTab, language: Language = 'ja'): string {
    const isEnglish = language === 'en';
    switch (tab) {
        case 'recipe':
            return isEnglish ? 'Right-click a blue note and choose “Create Recipe” to make your first recipe.' : '青付箋を右クリック → レシピにする で最初のレシピを作れます。';
        case 'shortcut':
            return isEnglish ? 'Right-click a note and choose “Add to Favorites” to add it here.' : '付箋を右クリック → お気に入りに登録 で追加できます。';
        case 'qa':
            return isEnglish ? 'Right-click a note and choose “❓ Create Q&A” to make your first Q&A.' : '付箋を右クリック → ❓ QAにする で最初のQAを作れます。';
        case 'term':
            return isEnglish ? 'Right-click a note and choose “📖 Create Term” to make your first term.' : '付箋を右クリック → 📖 用語にする で最初の用語を作れます。';
    }
}

export function nextSelectionIndex(current: number, itemCount: number, direction: 'up' | 'down'): number {
    if (itemCount <= 0) {
        return 0;
    }

    if (direction === 'up') {
        return current <= 0 ? itemCount - 1 : current - 1;
    }

    return current >= itemCount - 1 ? 0 : current + 1;
}

export function nextTab(current: LauncherTab, direction: 'left' | 'right'): LauncherTab {
    const currentIndex = LAUNCHER_TABS.findIndex((tab) => tab.key === current);
    const safeIndex = currentIndex >= 0 ? currentIndex : LAUNCHER_TABS.length - 1;
    const delta = direction === 'left' ? -1 : 1;
    const nextIndex = (safeIndex + delta + LAUNCHER_TABS.length) % LAUNCHER_TABS.length;
    return LAUNCHER_TABS[nextIndex].key;
}

export function shouldCloseLauncherAfterBlur(locked: boolean, isFocused: boolean): boolean {
    return !locked && !isFocused;
}

export function removeActionLabel(tab: LauncherTab, language: Language = 'ja'): string {
    return language === 'en'
        ? (tab === 'shortcut' ? 'Remove from Favorites' : 'Move to Trash')
        : (tab === 'shortcut' ? '棚から外す' : 'ゴミ箱へ移動');
}

export function isLatestLauncherRequest(requestId: number, currentRequestId: number): boolean {
    return requestId === currentRequestId;
}

export const ALL_TAGS_FILTER = '__all__';
export const UNCLASSIFIED_TAG_FILTER = '__unclassified__';

export function launcherTagOptions(items: QuickOpenItem[]): string[] {
    const seen = new Set<string>();
    let hasUnclassified = false;
    for (const item of items) {
        const userTags = getUserTags(item.tags);
        if (userTags.length === 0) hasUnclassified = true;
        userTags.forEach((tag) => seen.add(tag));
    }
    const tags = Array.from(seen).sort((a, b) => a.localeCompare(b, 'ja'));
    return hasUnclassified ? [...tags, UNCLASSIFIED_TAG_FILTER] : tags;
}

export function filterLauncherItemsByTag(items: QuickOpenItem[], filter: string): QuickOpenItem[] {
    if (!filter || filter === ALL_TAGS_FILTER) return items;
    if (filter === UNCLASSIFIED_TAG_FILTER) {
        return items.filter((item) => getUserTags(item.tags).length === 0);
    }
    return items.filter((item) => getUserTags(item.tags).includes(filter));
}


function useDebouncedValue(value: string, delayMs: number): string {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(value), delayMs);
        return () => window.clearTimeout(timer);
    }, [value, delayMs]);

    return debounced;
}

async function closeLauncherWindow() {
    // 閉じずに隠す（作り置き方式。次回の Ctrl+P を速くする）
    await getCurrentWindow().hide();
}

export default function QuickLauncher() {
    const { settings } = useSettings();
    const language = settings.language;
    const isEnglish = language === 'en';
    const launcherTabs = LAUNCHER_TABS.map((tab) => ({
        ...tab,
        label: isEnglish
            ? ({ shortcut: 'Favorites', qa: 'Q&A', term: 'Terms', recipe: 'Recipes' } as const)[tab.key]
            : tab.label,
    }));
    const [activeTab, setActiveTab] = useState<LauncherTab>('recipe');
    const [query, setQuery] = useState('');
    const [items, setItems] = useState<QuickOpenItem[]>([]);
    const [tagFilters, setTagFilters] = useState<Partial<Record<LauncherTab, string>>>({});
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isLocked, setIsLocked] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
    const [renameTarget, setRenameTarget] = useState<{ path: string; value: string } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const lockedRef = useRef(false);
    const requestGenerationRef = useRef(0);
    const debouncedQuery = useDebouncedValue(query, 120);

    useEffect(() => {
        lockedRef.current = isLocked;
    }, [isLocked]);

    const reloadItems = useCallback(async (tab: LauncherTab, search: string) => {
        const requestId = ++requestGenerationRef.current;
        setIsLoading(true);
        setError(null);
        try {
            const nextItems = await quickOpenNotes(tabToReservedTag(tab), search);
            if (!isLatestLauncherRequest(requestId, requestGenerationRef.current)) return;
            setItems(nextItems);
            setSelectedIndex((current) => Math.min(current, Math.max(nextItems.length - 1, 0)));
        } catch (e) {
            if (!isLatestLauncherRequest(requestId, requestGenerationRef.current)) return;
            setItems([]);
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            if (isLatestLauncherRequest(requestId, requestGenerationRef.current)) {
                setIsLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        getLauncherState()
            .then((state) => {
                if (cancelled) return;
                setActiveTab(normalizeLauncherTab(state.last_tab));
                setTagFilters(state.selected_tags ?? {});
            })
            .catch(() => {
                if (!cancelled) setActiveTab('recipe');
            })
            .finally(() => {
                if (!cancelled) inputRef.current?.focus();
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        reloadItems(activeTab, debouncedQuery);
    }, [activeTab, debouncedQuery, reloadItems]);

    useEffect(() => {
        let cancelled = false;
        let unlisten: (() => void) | undefined;

        listen(LAUNCHER_SHELF_CHANGED_EVENT, () => {
            if (shouldReloadLauncherForEvent(LAUNCHER_SHELF_CHANGED_EVENT)) {
                reloadItems(activeTab, debouncedQuery);
            }
        })
            .then((cleanup) => {
                if (cancelled) {
                    cleanup();
                    return;
                }
                unlisten = cleanup;
            })
            .catch((e) => {
                console.error('[QuickLauncher] failed to listen shelf changes:', e);
            });

        return () => {
            cancelled = true;
            unlisten?.();
        };
    }, [activeTab, debouncedQuery, reloadItems]);

    useEffect(() => {
        let cancelled = false;
        let unlisten: (() => void) | undefined;

        listen('fusen:launcher_shown', () => {
            reloadItems(activeTab, debouncedQuery);
            setSelectedIndex(0);
            inputRef.current?.focus();
            inputRef.current?.select();
        })
            .then((cleanup) => {
                if (cancelled) {
                    cleanup();
                    return;
                }
                unlisten = cleanup;
            })
            .catch((e) => {
                console.error('[QuickLauncher] failed to listen shown event:', e);
            });

        return () => {
            cancelled = true;
            unlisten?.();
        };
    }, [activeTab, debouncedQuery, reloadItems]);

    useEffect(() => {
        let blurTimer: number | null = null;

        const cancelPendingBlur = () => {
            if (blurTimer !== null) {
                window.clearTimeout(blurTimer);
                blurTimer = null;
            }
        };

        const onWindowBlur = () => {
            cancelPendingBlur();
            blurTimer = window.setTimeout(async () => {
                blurTimer = null;
                try {
                    const isFocused = await getCurrentWindow().isFocused();
                    if (shouldCloseLauncherAfterBlur(lockedRef.current, isFocused)) {
                        await closeLauncherWindow();
                    }
                } catch (e) {
                    console.error('[QuickLauncher] failed to verify window focus after blur:', e);
                }
            }, 120);
        };

        window.addEventListener('blur', onWindowBlur);
        window.addEventListener('focus', cancelPendingBlur);
        return () => {
            cancelPendingBlur();
            window.removeEventListener('blur', onWindowBlur);
            window.removeEventListener('focus', cancelPendingBlur);
        };
    }, []);

    useEffect(() => {
        const closeContextMenu = () => setContextMenu(null);
        window.addEventListener('click', closeContextMenu);
        return () => window.removeEventListener('click', closeContextMenu);
    }, []);

    const switchTab = useCallback(async (tab: LauncherTab) => {
        setActiveTab(tab);
        setSelectedIndex(0);
        setContextMenu(null);
        inputRef.current?.focus();
        try {
            await setLauncherLastTab(tab);
        } catch {
            // UI state should remain responsive even if persistence fails.
        }
    }, []);

    const openItem = useCallback(async (item: QuickOpenItem) => {
        await openQuickNote(item.path);
        if (!lockedRef.current) {
            await closeLauncherWindow();
        }
    }, []);

    const activeTagFilter = tagFilters[activeTab] ?? ALL_TAGS_FILTER;
    const tagOptions = useMemo(() => launcherTagOptions(items), [items]);
    const displayTagOptions = useMemo(() => {
        if (activeTagFilter !== ALL_TAGS_FILTER && !tagOptions.includes(activeTagFilter)) {
            return [activeTagFilter, ...tagOptions];
        }
        return tagOptions;
    }, [activeTagFilter, tagOptions]);
    const visibleItems = useMemo(
        () => filterLauncherItemsByTag(items, activeTagFilter),
        [items, activeTagFilter],
    );
    const selectedItem = useMemo(() => visibleItems[selectedIndex] ?? null, [visibleItems, selectedIndex]);

    const selectTagFilter = useCallback((tag: string) => {
        setTagFilters((current) => ({ ...current, [activeTab]: tag }));
        setSelectedIndex(0);
        setContextMenu(null);
        inputRef.current?.focus();
        setLauncherTagFilter(activeTab, tag).catch(() => {});
    }, [activeTab]);

    useEffect(() => {
        setSelectedIndex((current) => Math.min(current, Math.max(visibleItems.length - 1, 0)));
    }, [visibleItems.length]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Escape') {
            if (contextMenu) {
                setContextMenu(null);
                return;
            }
            if (!lockedRef.current) {
                e.preventDefault();
                closeLauncherWindow().catch(() => {});
            }
            return;
        }

        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            switchTab(nextTab(activeTab, e.key === 'ArrowLeft' ? 'left' : 'right')).catch(() => {});
            return;
        }

        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex((current) =>
                nextSelectionIndex(current, visibleItems.length, e.key === 'ArrowUp' ? 'up' : 'down'),
            );
            return;
        }

        if (e.key === 'Enter' && selectedItem) {
            e.preventDefault();
            openItem(selectedItem).catch((error) => setError(String(error)));
        }
    }, [activeTab, contextMenu, openItem, selectedItem, switchTab, visibleItems.length]);

    const handleReorder = useCallback(async (direction: 'up' | 'down', item?: QuickOpenItem) => {
        const targetItem = item ?? contextMenu?.item;
        if (!targetItem) return;
        const targetPath = targetItem.path;
        setContextMenu(null);
        try {
            await reorderQuickNote(activeTab, targetPath, direction);
            await reloadItems(activeTab, debouncedQuery);
            setSelectedIndex((current) => nextSelectionIndex(current, Math.max(items.length, 1), direction));
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [activeTab, contextMenu, debouncedQuery, items.length, reloadItems]);

    const handleRemove = useCallback(async (item?: QuickOpenItem) => {
        const targetItem = item ?? contextMenu?.item;
        if (!targetItem) return;
        const targetPath = targetItem.path;
        setContextMenu(null);
        if (activeTab === 'shortcut' && !window.confirm(isEnglish
            ? 'Remove this item from Favorites? The note will not be deleted.'
            : 'お気に入りから外しますか？（付箋は消えません）')) {
            return;
        }

        try {
            await removeFromShelf(targetPath);
            await reloadItems(activeTab, debouncedQuery);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [activeTab, contextMenu, debouncedQuery, isEnglish, reloadItems]);

    const startRename = useCallback((item?: QuickOpenItem) => {
        const targetItem = item ?? contextMenu?.item;
        if (!targetItem) return;
        setContextMenu(null);
        setRenameTarget({ path: targetItem.path, value: targetItem.title });
    }, [contextMenu]);

    const submitRename = useCallback(async () => {
        if (!renameTarget) return;
        const { path, value } = renameTarget;
        if (!value.trim()) return;
        setRenameTarget(null);
        try {
            await renameQuickNote(path, value);
            await reloadItems(activeTab, debouncedQuery);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [renameTarget, activeTab, debouncedQuery, reloadItems]);

    return (
        <div
            className="h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100"
            onKeyDown={handleKeyDown}
            tabIndex={-1}
        >
            <div
                data-tauri-drag-region
                className="flex h-8 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-3 text-xs text-zinc-400"
            >
                <span data-tauri-drag-region className="font-medium tracking-normal">Quick Launcher</span>
                <button
                    type="button"
                    onClick={() => {
                        playPinToggleSound(isLocked);
                        setIsLocked((value) => !value);
                    }}
                    className={`flex min-w-[28px] items-center justify-center rounded px-2 py-0.5 text-[16px] transition-all duration-200 ${
                        isLocked
                            ? 'bg-red-50 text-red-600 opacity-100 scale-100 hover:bg-red-100'
                            : 'text-gray-400 opacity-70 scale-95 hover:bg-zinc-800 hover:text-gray-200 hover:opacity-100'
                    }`}
                    aria-pressed={isLocked}
                    title={isEnglish ? 'Lock' : 'ロック'}
                >
                    <PinTackIcon active={isLocked} />
                </button>
            </div>

            <div className="flex h-[calc(100vh-2rem)] flex-col gap-2 p-2">
                <div className="grid grid-cols-4 gap-1">
                    {launcherTabs.map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => switchTab(tab.key).catch(() => {})}
                            className={`h-8 rounded text-xs font-medium ${
                                activeTab === tab.key
                                    ? 'bg-sky-500 text-white'
                                    : 'bg-zinc-800/70 text-zinc-300 hover:bg-zinc-800'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="flex min-h-7 gap-1 overflow-x-auto pb-0.5" aria-label={isEnglish ? 'Tag filter' : 'タグ区分'}>
                    <button
                        type="button"
                        onClick={() => selectTagFilter(ALL_TAGS_FILTER)}
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] ${
                            activeTagFilter === ALL_TAGS_FILTER
                                ? 'bg-sky-500 text-white'
                                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                        }`}
                    >
                        {isEnglish ? 'All' : 'すべて'}
                    </button>
                    {displayTagOptions.map((tag) => (
                        <button
                            key={tag}
                            type="button"
                            onClick={() => selectTagFilter(tag)}
                            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] ${
                                activeTagFilter === tag
                                    ? 'bg-sky-500 text-white'
                                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                            }`}
                        >
                            {tag === UNCLASSIFIED_TAG_FILTER ? (isEnglish ? 'Unclassified' : '未分類') : tag}
                        </button>
                    ))}
                </div>

                <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setSelectedIndex(0);
                    }}
                    className="h-9 rounded border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-sky-400"
                    placeholder={isEnglish ? 'Search' : '検索'}
                    autoFocus
                />

                {error && (
                    <div className="rounded border border-red-500/40 bg-red-950/50 px-2 py-1 text-xs text-red-200">
                        {error}
                    </div>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto rounded border border-zinc-800 bg-zinc-900/70">
                    {visibleItems.length === 0 && !isLoading ? (
                        <div className="flex h-full items-center justify-center px-5 text-center text-sm leading-6 text-zinc-500">
                            {items.length === 0 ? emptyMessageForTab(activeTab, language) : (isEnglish ? 'No items match this tag.' : 'このタグに該当する項目はありません。')}
                        </div>
                    ) : (
                        <div className="py-1">
                            {visibleItems.map((item, index) => (
                                <div
                                    key={item.path}
                                    role="button"
                                    tabIndex={-1}
                                    onClick={() => openItem(item).catch((error) => setError(String(error)))}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        setSelectedIndex(index);
                                        setContextMenu({ x: e.clientX, y: e.clientY, item });
                                    }}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                    className={`group grid h-9 w-full cursor-default grid-cols-[1.75rem_1fr_4.75rem] items-center gap-2 px-2 text-left text-sm ${
                                        selectedIndex === index
                                            ? 'bg-sky-500/25 text-white'
                                            : 'text-zinc-200 hover:bg-zinc-800'
                                    }`}
                                >
                                    <span className="text-base">{activeTab === 'qa' ? '❓' : activeTab === 'term' ? '📖' : item.is_recipe ? '🍳' : '📌'}</span>
                                    <span className="truncate">{truncateRecipeName(item.title || (isEnglish ? 'Untitled' : '無題'), 20)}</span>
                                    <span className="flex items-center justify-end gap-0.5">
                                        <span className="mr-1 text-[11px] text-zinc-500 group-hover:hidden">{item.launches}</span>
                                        <button
                                            type="button"
                                            title={isEnglish ? 'Move up' : '上へ'}
                                            aria-label={isEnglish ? 'Move up' : '上へ'}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedIndex(index);
                                                handleReorder('up', item).catch(() => {});
                                            }}
                                            className="hidden h-6 w-5 rounded text-[11px] text-zinc-300 hover:bg-zinc-700 hover:text-white group-hover:inline-flex group-hover:items-center group-hover:justify-center"
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            title={isEnglish ? 'Move down' : '下へ'}
                                            aria-label={isEnglish ? 'Move down' : '下へ'}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedIndex(index);
                                                handleReorder('down', item).catch(() => {});
                                            }}
                                            className="hidden h-6 w-5 rounded text-[11px] text-zinc-300 hover:bg-zinc-700 hover:text-white group-hover:inline-flex group-hover:items-center group-hover:justify-center"
                                        >
                                            ↓
                                        </button>
                                        <button
                                            type="button"
                                            title={removeActionLabel(activeTab, language)}
                                            aria-label={removeActionLabel(activeTab, language)}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedIndex(index);
                                                handleRemove(item).catch(() => {});
                                            }}
                                            className="hidden h-6 w-5 rounded text-[11px] text-red-200 hover:bg-red-950 hover:text-red-100 group-hover:inline-flex group-hover:items-center group-hover:justify-center"
                                        >
                                            ×
                                        </button>
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex h-5 items-center justify-between text-[11px] text-zinc-600">
                    <span>{isLoading ? (isEnglish ? 'Loading' : '読み込み中') : `${visibleItems.length} / ${items.length}${isEnglish ? '' : ' 件'}`}</span>
                    <span>{isLocked ? (isEnglish ? 'Locked' : 'ロック中') : (isEnglish ? 'Close with Esc or blur' : 'Esc / blur で閉じる')}</span>
                </div>
            </div>

            {contextMenu && (
                <div
                    className="fixed z-50 min-w-32 overflow-hidden rounded border border-zinc-700 bg-zinc-900 py-1 text-sm text-zinc-100 shadow-xl"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        type="button"
                        className="block w-full px-3 py-1.5 text-left hover:bg-zinc-800"
                        onClick={() => handleReorder('up')}
                    >
                        {isEnglish ? 'Move Up' : '上へ移動'}
                    </button>
                    <button
                        type="button"
                        className="block w-full px-3 py-1.5 text-left hover:bg-zinc-800"
                        onClick={() => handleReorder('down')}
                    >
                        {isEnglish ? 'Move Down' : '下へ移動'}
                    </button>
                    <button
                        type="button"
                        className="block w-full px-3 py-1.5 text-left hover:bg-zinc-800"
                        onClick={() => startRename()}
                    >
                        {isEnglish ? 'Rename' : '名前を変更'}
                    </button>
                    <div className="my-1 h-px bg-zinc-800" />
                    <button
                        type="button"
                        className="block w-full px-3 py-1.5 text-left text-red-200 hover:bg-red-950"
                        onClick={() => handleRemove()}
                    >
                        {removeActionLabel(activeTab, language)}
                    </button>
                </div>
            )}

            {renameTarget && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
                    onClick={() => setRenameTarget(null)}
                >
                    <div
                        className="flex w-full max-w-sm flex-col gap-3 rounded-lg bg-zinc-900 p-4 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="text-sm font-bold text-zinc-100">{isEnglish ? 'Rename' : '名前を変更'}</div>
                        <input
                            autoFocus
                            type="text"
                            className="rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-sky-500 focus:outline-none"
                            value={renameTarget.value}
                            onChange={(e) => setRenameTarget({ ...renameTarget, value: e.target.value })}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    submitRename();
                                } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setRenameTarget(null);
                                }
                            }}
                        />
                        <div className="flex justify-end gap-2 text-sm">
                            <button
                                type="button"
                                className="px-3 py-1.5 text-zinc-400 hover:text-zinc-200"
                                onClick={() => setRenameTarget(null)}
                            >
                                {isEnglish ? 'Cancel' : 'キャンセル'}
                            </button>
                            <button
                                type="button"
                                className="rounded bg-sky-600 px-4 py-1.5 font-bold text-white hover:bg-sky-500 disabled:opacity-50"
                                disabled={!renameTarget.value.trim()}
                                onClick={submitRename}
                            >
                                {isEnglish ? 'Rename' : '変更'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
