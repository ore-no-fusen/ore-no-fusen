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
import PinTackIcon from './PinTackIcon';
import { getTranslation, type Language } from '@/lib/i18n';

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
    language?: Language;
    onAlarmClick?: () => void;
    alarmAtStr?: string | null;
    alarmTooltip?: string;
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
    onCreateNewNote,
    language,
    onAlarmClick,
    alarmAtStr,
    alarmTooltip,
}: ToolbarButtonsProps) {
    const t = getTranslation(language ?? 'ja');
    // 通常モード時：ツールバー（折りたたみ + ピン）
    if (!isEditing) {
        return (
            <div
                className={`hoverBar flex flex-row justify-end items-center gap-[2px] p-1 bg-transparent rounded-lg z-[200] transition-opacity duration-100 ease-in ${show || isWelcome ? 'opacity-100 visible pointer-events-auto' : 'opacity-0 invisible pointer-events-none'
                    }`}
            >
                {/* アラームボタン（アラームがセットされている時のみ表示） */}
                {onAlarmClick && alarmAtStr && (
                    <Tooltip text={alarmTooltip || ''} placement="top-right">
                        <button
                            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onClick={() => onAlarmClick()}
                            className="text-gray-600 hover:bg-gray-200 px-2 min-w-[28px] rounded flex items-center justify-center text-[13px]"
                        >
                            ⏰
                        </button>
                    </Tooltip>
                )}

                {/* 新規作成ボタン (左端) */}
                {onCreateNewNote && (
                    <Tooltip text={t('tooltip.newNote')} hint="Ctrl+N" placement="top-right-arrow-shifted">
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
                <Tooltip text={isMinimized ? t('tooltip.unfold') : t('tooltip.fold')} placement="top-right">
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
                    <Tooltip text={isPinned ? t('tooltip.unpin') : t('tooltip.pin')} placement="top-right-shifted">
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
                                <PinTackIcon active={true} />
                            ) : (
                                // OFF State: Unpinned (外れている)
                                // Pin lying on its side
                                <PinTackIcon active={false} />
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
                <Tooltip text={t('tooltip.table')} placement="top-right">
                    <button
                        onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                        }}
                        onClick={onTable}
                        onKeyDown={handleButtonKeyDown}
                        tabIndex={0}
                        aria-label={t('tooltip.table')}
                        className="text-gray-700 hover:bg-gray-100 px-2 min-w-[32px] rounded flex items-center justify-center text-sm"
                    >
                        ⊞
                    </button>
                </Tooltip>
            )}

            {/* Mermaid変換ボタン */}
            {onMermaid && (
                <Tooltip text={t('tooltip.mermaid')} placement="top-right">
                    <button
                        onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                        }}
                        onClick={onMermaid}
                        onKeyDown={handleButtonKeyDown}
                        tabIndex={0}
                        aria-label={t('tooltip.mermaid')}
                        className="text-gray-700 hover:bg-gray-100 px-2 min-w-[32px] rounded flex items-center justify-center text-sm"
                    >
                        🔷
                    </button>
                </Tooltip>
            )}

            {/* Capture ボタン */}
            <Tooltip text={t('tooltip.capture')} hint={t('tooltip.captureHint')} placement="top-right">
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
