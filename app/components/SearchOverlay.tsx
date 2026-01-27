'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

type SearchHit = {
    path: string;
    line: number;
    preview: string;
};

type SearchOverlayProps = {
    onClose: () => void;
    getWindowLabel: (path: string) => string;
};

export default function SearchOverlay({ onClose, getWindowLabel }: SearchOverlayProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchHit[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isSearching, setIsSearching] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

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
    }, [query]);

    const jumpToHit = async (hit: SearchHit) => {
        const label = getWindowLabel(hit.path);
        try {
            const existing = await WebviewWindow.getByLabel(label);
            if (existing) {
                await existing.show();
                await existing.unminimize();
                await existing.setFocus();
                // 行番号、検索語、対象パスを渡してハイライト
                await existing.emit('fusen:scroll_to_line', {
                    line: hit.line,
                    query: query,
                    targetPath: hit.path
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
                });
                win.once('tauri://created', async () => {
                    await win.setFocus();
                });
            }
        } catch (e) {
            console.error('Failed to jump to hit:', e);
        }
    };

    const handleNext = useCallback(async () => {
        if (results.length === 0) return;
        const nextIndex = (currentIndex + 1) % results.length;
        setCurrentIndex(nextIndex);
        await jumpToHit(results[nextIndex]);
    }, [results, currentIndex]);

    const handlePrev = useCallback(async () => {
        if (results.length === 0) return;
        const prevIndex = (currentIndex - 1 + results.length) % results.length;
        setCurrentIndex(prevIndex);
        await jumpToHit(results[prevIndex]);
    }, [results, currentIndex]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (e.shiftKey && results.length > 0) {
                handlePrev();
            } else if (results.length > 0 && !isSearching) {
                handleNext();
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
            className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-white/98 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-200 p-4 flex flex-col gap-3"
            style={{ width: '450px', maxHeight: '500px' }}
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
                    placeholder="全付箋を検索..."
                    className="flex-1 bg-gray-100 rounded-lg px-3 py-2 outline-none text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-blue-400"
                    autoFocus
                />
                <button
                    onClick={handleSearch}
                    disabled={isSearching || !query.trim()}
                    className="px-3 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg disabled:opacity-50 font-medium"
                >
                    {isSearching ? '...' : '検索'}
                </button>
                <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-600 p-1"
                >
                    ✕
                </button>
            </div>

            {/* 結果件数とナビゲーション */}
            {results.length > 0 && (
                <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>{currentIndex + 1} / {results.length} 件</span>
                    <div className="flex gap-1">
                        <button
                            onClick={handlePrev}
                            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                            title="前へ (Shift+Enter)"
                        >
                            ◀
                        </button>
                        <button
                            onClick={handleNext}
                            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                            title="次へ (Enter / F3)"
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
                                {getFileName(hit.path)} : {hit.line}行目
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
                    検索結果がありません
                </div>
            )}

            {/* ヘルプ */}
            <div className="text-xs text-gray-400 text-center pt-2 border-t border-gray-100">
                Enter: 検索/次へ | Shift+Enter: 前へ | Esc: 閉じる
            </div>
        </div>
    );
}
