'use client';

/**
 * 検索オーバーレイコンポーネント
 *
 * 責務:
 * - 全文検索UIの表示
 * - 検索クエリの入力とバックエンドへの送信
 * - 検索結果リストの表示とハイライト
 * - 検索結果選択時のナビゲーション処理
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { Language } from '@/lib/i18n';

type SearchHit = {
    path: string;
    line: number;
    preview: string;
    kind?: 'QA' | 'Reci' | 'Term' | null;
};

type SearchOverlayProps = {
    onClose: () => void;
    getWindowLabel: (path: string) => string;
    language?: Language;
};

export default function SearchOverlay({ onClose, getWindowLabel, language = 'ja' }: SearchOverlayProps) {
    const isEnglish = language === 'en';
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchHit[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isSearching, setIsSearching] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    const jumpToHit = useCallback(async (hit: SearchHit) => {
        // [Fix] Ensure path is consistent (though getWindowLabel handles normalization)
        const label = getWindowLabel(hit.path);
        console.log(`[SearchOverlay] jumpToHit: path=${hit.path}, label=${label}`);
        try {
            // [Fix] Robust window finding: getByLabel -> getAllWebviewWindows
            // Try getByLabel first
            let targetWin = await WebviewWindow.getByLabel(label);

            // If not found, try getAllWebviewWindows as fallback (sometimes getByLabel fails contextually)
            if (!targetWin) {
                try {
                    const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
                    const allWindows = await getAllWebviewWindows();
                    console.log(`[SearchOverlay] Searching for label: ${label}`);
                    console.log('[SearchOverlay] Available windows:', allWindows.map(w => w.label));
                    targetWin = allWindows.find(w => w.label === label) || null;
                } catch (e) {
                    console.warn('[SearchOverlay] Failed to get all windows:', e);
                }
            }

            if (targetWin) {
                console.log(`[SearchOverlay] Found existing window: ${label}`);
                await targetWin.show();
                await targetWin.unminimize();
                await targetWin.setFocus();
                // 行番号、検索語、対象パスを渡してハイライト
                await targetWin.emit('fusen:scroll_to_line', {
                    line: hit.line,
                    query: query,
                    path: hit.path // [Fix] corrected property name
                });
            } else {
                // Open new window with line parameter and query
                const safePath = hit.path.replace(/\\/g, '/');
                const pathParam = encodeURIComponent(safePath);
                const queryParam = encodeURIComponent(query);
                const url = `/?path=${pathParam}&line=${hit.line}&highlight=${queryParam}`;
                const win = new WebviewWindow(label, {
                    url,
                    transparent: true,
                    decorations: false,
                    width: 400,
                    height: 300,
                    visible: true,
                    focus: true,
                    skipTaskbar: true,
                });
                win.once('tauri://created', async () => {
                    await win.setFocus();
                    // [NEW] Alt+Tab/タスクビューから除外
                    try {
                        const { invoke } = await import('@tauri-apps/api/core');
                        await invoke('fusen_make_tool_window');
                    } catch (e) {
                        console.warn('[SearchOverlay] Failed to apply tool window style:', e);
                    }
                });
            }
        } catch (e) {
            console.error('Failed to jump to hit:', e);
        }
    }, [getWindowLabel, query]);

    const handleSearch = useCallback(async () => {
        if (!query.trim()) return;
        setIsSearching(true);
        try {
            console.log('[SearchOverlay] Invoking fusen_search_notes with query:', query.trim());
            const hits = await invoke<SearchHit[]>('fusen_search_notes', { query: query.trim() });
            console.log('[SearchOverlay] Got results:', hits.length);
            setResults(hits);
            setCurrentIndex(0);
            if (hits.length > 0) {
                await jumpToHit(hits[0]);
            }
        } catch (e) {
            console.error('Search failed:', e);
        } finally {
            setIsSearching(false);
        }
    }, [query, jumpToHit]);

    const handleNext = useCallback(async () => {
        if (results.length === 0) return;
        const nextIndex = (currentIndex + 1) % results.length;
        setCurrentIndex(nextIndex);
        await jumpToHit(results[nextIndex]);
    }, [results, currentIndex, jumpToHit]);

    const handlePrev = useCallback(async () => {
        if (results.length === 0) return;
        const prevIndex = (currentIndex - 1 + results.length) % results.length;
        setCurrentIndex(prevIndex);
        await jumpToHit(results[prevIndex]);
    }, [results, currentIndex, jumpToHit]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (e.shiftKey && results.length > 0) {
                handlePrev();
            } else {
                handleSearch();
            }
        } else if (e.key === 'Escape') {
            onClose();
        } else if (e.key === 'F3' || (e.key === 'g' && e.ctrlKey)) {
            e.preventDefault();
            if (e.shiftKey) {
                handlePrev();
            } else {
                handleNext();
            }
        }
    };

    // ファイル名を取得
    const getFileName = (path: string) => {
        return path.split(/[\\/]/).pop() || path;
    };

    return (
        <div
            className="fixed inset-0 z-search bg-white/98 backdrop-blur-md flex flex-col gap-3 p-4 box-border"
        >
            {/* 検索入力 */}
            <div className="flex items-center gap-2">
                <span className="text-gray-400 text-xl">🔍</span>
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isEnglish ? 'Search all notes...' : '全付箋を検索...'}
                    className="flex-1 bg-gray-100 rounded-lg px-3 py-2 outline-none text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-blue-400"
                    autoFocus
                />
                <button
                    onClick={handleSearch}
                    disabled={isSearching || !query.trim()}
                    className="px-3 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg disabled:opacity-50 font-medium"
                >
                    {isSearching ? '...' : (isEnglish ? 'Search' : '検索')}
                </button>
            </div>

            {/* 結果件数とナビゲーション */}
            {results.length > 0 && (
                <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>{currentIndex + 1} / {results.length}{isEnglish ? '' : ' 件'}</span>
                    <div className="flex gap-1">
                        <button
                            onClick={handlePrev}
                            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                            title={isEnglish ? 'Previous (Shift+Enter)' : '前へ (Shift+Enter)'}
                        >
                            ◀
                        </button>
                        <button
                            onClick={handleNext}
                            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                            title={isEnglish ? 'Next (Enter / F3)' : '次へ (Enter / F3)'}
                        >
                            ▶
                        </button>
                    </div>
                </div>
            )}

            {/* 結果リスト */}
            {results.length > 0 && (
                <div className="overflow-y-auto max-h-64 border-t border-gray-100 pt-2">
                    {results.map((hit, idx) => (
                        <button
                            key={`${hit.path}-${hit.line}`}
                            onClick={() => {
                                setCurrentIndex(idx);
                                jumpToHit(hit);
                            }}
                            className={`w-full text-left p-2 rounded-lg mb-1 transition-colors ${idx === currentIndex
                                ? 'bg-blue-100 border border-blue-300'
                                : 'hover:bg-gray-100'
                                }`}
                        >
                            <div className="text-xs text-gray-500 truncate">
                                {hit.kind && <span className="mr-1 font-bold text-blue-600">[{hit.kind}]</span>}
                                {getFileName(hit.path)} : {isEnglish ? `line ${hit.line}` : `${hit.line}行目`}
                            </div>
                            <div className="text-sm text-gray-700 truncate">
                                {hit.preview}
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* 検索結果なし */}
            {results.length === 0 && query.trim() && !isSearching && (
                <div className="text-center text-gray-400 py-4">
                    {isEnglish ? 'No results found' : '検索結果がありません'}
                </div>
            )}

            {/* ヘルプ */}
            <div className="text-xs text-gray-400 text-center pt-2 border-t border-gray-100">
                {isEnglish
                    ? 'Enter: Search/Next | Shift+Enter: Previous | Esc: Close'
                    : 'Enter: 検索/次へ | Shift+Enter: 前へ | Esc: 閉じる'}
            </div>
        </div>
    );
}
