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

export type ToolbarButtonsProps = {
    isEditing: boolean;
    isMinimized: boolean;
    show: boolean;
    onBold?: () => void;
    onHeading?: () => void;
    onList?: () => void;
    onCheckbox?: () => void;
    onCapture?: () => void;
    onToggleMinimize: () => void;
};

export default function ToolbarButtons({
    isEditing,
    isMinimized,
    show,
    onBold,
    onHeading,
    onList,
    onCheckbox,
    onCapture,
    onToggleMinimize
}: ToolbarButtonsProps) {
    // 通常モード時：ミニマイズボタンのみ
    if (!isEditing) {
        return (
            <div
                className="hoverBar"
                style={{
                    opacity: show ? 1 : 0,
                    visibility: show ? 'visible' : 'hidden',
                    pointerEvents: show ? 'auto' : 'none',
                    transition: 'opacity 0.1s ease',
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    gap: '0px',
                    padding: '4px',
                    backgroundColor: 'transparent',
                    borderRadius: '8px',
                    zIndex: 200
                }}
            >
                <button
                    onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                    onClick={() => onToggleMinimize()}
                    className="text-gray-600 hover:bg-gray-200 px-2 min-w-[28px] rounded text-sm flex items-center justify-center"
                    title={isMinimized ? '展開する' : '畳む'}
                    style={{ fontSize: '14px' }}
                >
                    {isMinimized ? '▽' : '△'}
                </button>
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

    // 編集モード時：全ツールバー
    return (
        <div
            className="hoverBar"
            style={{
                opacity: show || isEditing ? 1 : 0,
                visibility: show || isEditing ? 'visible' : 'hidden',
                pointerEvents: show || isEditing ? 'auto' : 'none',
                transition: 'opacity 0.1s ease',
                display: 'flex', // Flexbox ensures buttons are in row
                flexDirection: 'row',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: '0px',
                padding: '4px',
                backgroundColor: 'transparent',
                borderRadius: '8px',
                backdropFilter: 'none',
                zIndex: 200
            }}
        >
            {/* Bold ボタン */}
            <button
                onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                onClick={onBold}
                onKeyDown={handleButtonKeyDown}
                tabIndex={0}
                className="font-bold text-red-600 hover:bg-gray-100 px-2 min-w-[32px] rounded text-sm flex items-center justify-center whitespace-nowrap"
                title="太字 (赤)"
            >
                B
            </button>

            {/* Heading1 ボタン */}
            <button
                onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                onClick={onHeading}
                onKeyDown={handleButtonKeyDown}
                tabIndex={0}
                className="font-bold text-gray-700 hover:bg-gray-100 px-2 min-w-[32px] rounded text-sm flex items-center justify-center whitespace-nowrap"
                title="見出し1"
            >
                <span style={{ fontSize: '14px', position: 'relative', top: '-1px' }}>
                    H<sub style={{ bottom: '0', fontSize: '10px' }}>1</sub>
                </span>
            </button>

            {/* List ボタン */}
            <button
                onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                onClick={onList}
                onKeyDown={handleButtonKeyDown}
                tabIndex={0}
                className="text-gray-700 hover:bg-gray-100 px-2 min-w-[32px] rounded flex items-center justify-center"
                title="箇条書き"
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
                    <line x1="9" y1="6" x2="20" y2="6"></line>
                    <line x1="9" y1="12" x2="20" y2="12"></line>
                    <line x1="9" y1="18" x2="20" y2="18"></line>
                    <circle cx="5" cy="6" r="1.5" fill="currentColor"></circle>
                    <circle cx="5" cy="12" r="1.5" fill="currentColor"></circle>
                    <circle cx="5" cy="18" r="1.5" fill="currentColor"></circle>
                </svg>
            </button>

            {/* Checkbox ボタン */}
            <button
                onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                onClick={onCheckbox}
                onKeyDown={handleButtonKeyDown}
                tabIndex={0}
                className="text-gray-700 hover:bg-gray-100 px-2 min-w-[32px] rounded flex items-center justify-center"
                title="チェックボックス"
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
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <polyline points="9 11 12 14 22 4"></polyline>
                </svg>
            </button>



            {/* Capture ボタン */}
            <button
                onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                onClick={onCapture}
                onKeyDown={handleButtonKeyDown}
                tabIndex={0}
                className="text-gray-700 hover:bg-gray-100 px-2 min-w-[32px] rounded flex items-center justify-center"
                title="画面キャプチャ"
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
        </div>
    );
}
