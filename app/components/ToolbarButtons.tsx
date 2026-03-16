/**
 * ツールバーボタン群コンポーネント
 *
 * 責務:
 * - Bold, Heading, List, Checkbox, Capture ボタンの表示
 * - ミニマイズボタンの表示
 * - 編集モード/通常モードでの表示切り替え
 */

'use client';

import React from 'react';
import Tooltip from './Tooltip';

export type ToolbarButtonsProps = {
    isEditing: boolean;
    isMinimized: boolean;
    isPinned?: boolean; // [New]
    show: boolean;
    isWelcome?: boolean; // ウェルカムノート時に＋ボタンを強調
    onTable?: () => void;
    onMermaid?: () => void;
    onCapture?: () => void;
    onToggleMinimize: () => void;
    onTogglePin?: () => void; // [New]
    onCreateNewNote?: () => void; // [New] 新規付箋作成
};

export default function ToolbarButtons({
    isEditing,
    isMinimized,
    isPinned,
    show,
    isWelcome,
    onTable,
    onMermaid,
    onCapture,
    onToggleMinimize,
    onTogglePin,
    onCreateNewNote
}: ToolbarButtonsProps) {
    // 通常モード時：ツールバー（折りたたみ + ピン）
    if (!isEditing) {
        return (
            <div
                className={`hoverBar flex flex-row justify-end items-center gap-[2px] p-1 bg-transparent rounded-lg z-[200] transition-opacity duration-100 ease-in ${show || isWelcome ? 'opacity-100 visible pointer-events-auto' : 'opacity-0 invisible pointer-events-none'
                    }`}
            >
                {/* 新規作成ボタン (左端) */}
                {onCreateNewNote && (
                    <Tooltip text="新しい付箋" hint="Ctrl+N" placement="top-right">
                        <button
                            onPointerDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                            }}
                            onClick={() => onCreateNewNote()}
                            className={`text-gray-600 hover:bg-gray-200 px-2 min-w-[28px] rounded flex items-center justify-center text-[14px] ${isWelcome ? 'animate-bounce text-orange-500 font-bold' : ''}`}
                        >
                            ＋
                        </button>
                    </Tooltip>
                )}

                {/* 折りたたみボタン */}
                <Tooltip text={isMinimized ? '展開する' : '畳む'} placement="top-right">
                    <button
                        onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                        }}
                        onClick={() => onToggleMinimize()}
                        className="text-gray-600 hover:bg-gray-200 px-2 min-w-[28px] rounded flex items-center justify-center text-[14px]"
                    >
                        {isMinimized ? '▽' : '△'}
                    </button>
                </Tooltip>

                {/* ピン留めボタン (右) */}
                {onTogglePin && (
                    <Tooltip text={isPinned ? '最前面固定を解除' : '最前面に固定'} placement="top-right">
                        <button
                            onPointerDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                            }}
                            onClick={() => {
                                // Sound Effect
                                try {
                                    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
                                    if (AudioContext) {
                                        const ctx = new AudioContext();
                                        const osc = ctx.createOscillator();
                                        const gain = ctx.createGain();
                                        const now = ctx.currentTime;

                                        osc.connect(gain);
                                        gain.connect(ctx.destination);

                                        if (!isPinned) {
                                            // Turning ON (Pinning) - "Gyuh" (Thud/Press)
                                            // Low frequency, short, dull sound
                                            osc.type = 'triangle';
                                            osc.frequency.setValueAtTime(120, now);
                                            osc.frequency.exponentialRampToValueAtTime(60, now + 0.08);

                                            gain.gain.setValueAtTime(0.6, now);
                                            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

                                            osc.start(now);
                                            osc.stop(now + 0.15);
                                        } else {
                                            // Turning OFF (Unpinning) - "Pop" (Release)
                                            // Higher pitch, light pop
                                            osc.type = 'sine';
                                            osc.frequency.setValueAtTime(400, now);
                                            osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);

                                            gain.gain.setValueAtTime(0.3, now);
                                            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

                                            osc.start(now);
                                            osc.stop(now + 0.1);
                                        }

                                        // Cleanup AudioContext
                                        setTimeout(() => {
                                            ctx.close();
                                        }, 200);
                                    }
                                } catch (e) {
                                    console.error('SFX Error:', e);
                                }

                                onTogglePin();
                            }}
                            className={`px-2 min-w-[28px] rounded flex items-center justify-center transition-all duration-200 text-[16px] ${isPinned
                                ? 'text-red-600 bg-red-50 hover:bg-red-100 scale-100 opacity-100'
                                : 'text-gray-400 hover:bg-gray-200 hover:text-gray-600 scale-95 opacity-70 hover:opacity-100'
                                }`}
                        >
                            {isPinned ? (
                                // ON State: Pinned (刺さっている)
                                // Vertical pin, firmly planted
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 2L12 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                    <rect x="8" y="2" width="8" height="6" rx="1" fill="currentColor" />
                                    {/* Shadow/Hole at the bottom to indicate insertion */}
                                    <ellipse cx="12" cy="15" rx="3" ry="1.5" fill="rgba(0,0,0,0.3)" />
                                </svg>
                            ) : (
                                // OFF State: Unpinned (外れている)
                                // Pin lying on its side
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="rotate-45">
                                    <path d="M16 12L7 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                    <rect x="16" y="8" width="6" height="8" rx="1" fill="currentColor" stroke="currentColor" strokeWidth="2" />
                                    <path d="M4 12L7 12" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                                </svg>
                            )}
                        </button>
                    </Tooltip>
                )}
            </div>
        );
    }

    // キーボードナビゲーションハンドラ
    const handleButtonKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        // Tab (next) or ArrowRight
        if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'ArrowRight') {
            e.preventDefault();
            const parent = e.currentTarget.parentElement;
            if (!parent) return;

            const buttons = Array.from(parent.querySelectorAll('button:not(:disabled)'));
            const index = buttons.indexOf(e.currentTarget);

            if (index >= 0 && index < buttons.length - 1) {
                (buttons[index + 1] as HTMLElement).focus();
            } else {
                // Return to Editor (loop)
                const editor = document.querySelector('.cm-content');
                if (editor) (editor as HTMLElement).focus();
            }
        }

        // Tab+Shift (prev) or ArrowLeft
        if ((e.key === 'Tab' && e.shiftKey) || e.key === 'ArrowLeft') {
            e.preventDefault();
            const parent = e.currentTarget.parentElement;
            if (!parent) return;

            const buttons = Array.from(parent.querySelectorAll('button:not(:disabled)'));
            const index = buttons.indexOf(e.currentTarget);

            if (index > 0) {
                (buttons[index - 1] as HTMLElement).focus();
            } else {
                // Return to Editor (loop)
                const editor = document.querySelector('.cm-content');
                if (editor) (editor as HTMLElement).focus();
            }
        }
    };

    // 編集モード時：挿入系ツールバー
    return (
        <div
            className={`hoverBar flex flex-row justify-end items-center gap-0 p-1 bg-transparent rounded-lg backdrop-filter-none z-[200] transition-opacity duration-100 ease-in ${show || isEditing ? 'opacity-100 visible pointer-events-auto' : 'opacity-0 invisible pointer-events-none'
                }`}
        >
            {/* テーブル変換ボタン */}
            {onTable && (
                <Tooltip text="テーブル変換" placement="top-right">
                    <button
                        onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                        }}
                        onClick={onTable}
                        onKeyDown={handleButtonKeyDown}
                        tabIndex={0}
                        aria-label="テーブル変換"
                        className="text-gray-700 hover:bg-gray-100 px-2 min-w-[32px] rounded flex items-center justify-center text-sm"
                    >
                        ⊞
                    </button>
                </Tooltip>
            )}

            {/* Mermaid変換ボタン */}
            {onMermaid && (
                <Tooltip text="Mermaid変換" placement="top-right">
                    <button
                        onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                        }}
                        onClick={onMermaid}
                        onKeyDown={handleButtonKeyDown}
                        tabIndex={0}
                        aria-label="Mermaid変換"
                        className="text-gray-700 hover:bg-gray-100 px-2 min-w-[32px] rounded flex items-center justify-center text-sm"
                    >
                        🔷
                    </button>
                </Tooltip>
            )}

            {/* Capture ボタン */}
            <Tooltip text="画面キャプチャ" hint="Shift+Win+S → Ctrl+V" placement="top-right">
                <button
                    onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                    onClick={onCapture}
                    onKeyDown={handleButtonKeyDown}
                    tabIndex={0}
                    className="text-gray-700 hover:bg-gray-100 px-2 min-w-[32px] rounded flex items-center justify-center"
                >
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                        <circle cx="12" cy="13" r="4"></circle>
                    </svg>
                </button>
            </Tooltip>
        </div>
    );
}
