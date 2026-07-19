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
import { playPinToggleSound } from '../utils/pinToggleSound';
import { STICKY_ACTION_SYMBOLS } from '@/app/utils/stickyActionSymbols';
import { STICKY_ICON_BUTTON_SIZE } from '@/app/utils/stickyControlStyles';
import StickyActionIcon from './StickyActionIcon';

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
    newNoteShortcutHint?: string;
    archiveLabel?: string;
    onArchive?: (event: React.MouseEvent<HTMLButtonElement>) => void;
    deleteLabel?: string;
    onDelete?: () => void;
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
    newNoteShortcutHint,
    archiveLabel,
    onArchive,
    deleteLabel,
    onDelete,
}: ToolbarButtonsProps) {
    const t = getTranslation(language ?? 'ja');
    // 通常モード時：ツールバー（折りたたみ + ピン）
    if (!isEditing) {
        return (
            <div
                className={`hoverBar flex flex-col items-end p-1 bg-transparent rounded-lg z-[200] transition-opacity duration-100 ease-in ${show || isWelcome ? 'opacity-100 visible pointer-events-auto' : 'opacity-0 invisible pointer-events-none'
                    }`}
            >
                <div data-testid="sticky-primary-actions" className="flex flex-row items-center gap-[2px]">
                {/* アラームボタン（アラームがセットされている時のみ表示） */}
                {onAlarmClick && alarmAtStr && (
                    <Tooltip text={alarmTooltip || ''} placement="top-right">
                        <button
                            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onClick={() => onAlarmClick()}
                            className={`${STICKY_ICON_BUTTON_SIZE} text-gray-600 hover:bg-gray-200 px-2 rounded flex items-center justify-center text-[13px]`}
                        >
                            ⏰
                        </button>
                    </Tooltip>
                )}

                {/* 新規作成ボタン (左端) */}
                {onCreateNewNote && (
                    <Tooltip text={t('tooltip.newNote')} hint={newNoteShortcutHint} placement="top-right-arrow-shifted">
                        <button
                            onPointerDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                            }}
                            onClick={() => onCreateNewNote()}
                            className={`${STICKY_ICON_BUTTON_SIZE} text-gray-600 hover:bg-gray-200 px-2 rounded flex items-center justify-center text-[14px] ${isWelcome ? 'animate-bounce text-orange-500 font-bold' : ''}`}
                        >
                            {STICKY_ACTION_SYMBOLS.newNote}
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
                        className={`${STICKY_ICON_BUTTON_SIZE} text-gray-600 hover:bg-gray-200 px-2 rounded flex items-center justify-center text-[14px]`}
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
                                playPinToggleSound(Boolean(isPinned));
                                onTogglePin();
                            }}
                            className={`${STICKY_ICON_BUTTON_SIZE} px-2 rounded flex items-center justify-center transition-all duration-200 text-[16px] ${isPinned
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

                {!isMinimized && (onArchive || onDelete) && (
                    <div data-testid="sticky-caution-actions" className="mt-3 flex flex-col items-center gap-1">
                        {onArchive && archiveLabel && (
                            <Tooltip text={archiveLabel} placement="top-right-shifted">
                                <button
                                    type="button"
                                    aria-label={archiveLabel}
                                    onPointerDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                    }}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onArchive(e);
                                    }}
                                    className={`${STICKY_ICON_BUTTON_SIZE} px-1 rounded text-[13px] leading-none flex items-center justify-center text-gray-500 bg-gray-200/70 border border-gray-300/80 shadow-sm hover:bg-emerald-100 hover:text-emerald-700 hover:border-emerald-200 transition-colors`}
                                >
                                    <StickyActionIcon kind="archive" />
                                </button>
                            </Tooltip>
                        )}
                        {onDelete && (
                            <Tooltip text={deleteLabel || t('menu.delete')} hint="Ctrl+D" placement="top-right-shifted">
                                <button
                                    type="button"
                                    aria-label={deleteLabel || t('menu.delete')}
                                    onPointerDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                    }}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onDelete();
                                    }}
                                    className={`${STICKY_ICON_BUTTON_SIZE} px-1 rounded text-[13px] leading-none flex items-center justify-center text-gray-500 bg-gray-200/70 border border-gray-300/80 shadow-sm hover:bg-red-100 hover:text-red-600 hover:border-red-200 transition-colors`}
                                >
                                    <StickyActionIcon kind="delete" />
                                </button>
                            </Tooltip>
                        )}
                    </div>
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
