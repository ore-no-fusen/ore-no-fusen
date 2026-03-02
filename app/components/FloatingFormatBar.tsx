'use client';

import React from 'react';

type Props = {
    top: number;
    left: number;
    onBold: () => void;
    onHeading: () => void;
    onList: () => void;
    onCheckbox: () => void;
};

export default function FloatingFormatBar({ top, left, onBold, onHeading, onList, onCheckbox }: Props) {
    return (
        <div
            className="floatBar absolute z-[300] bg-white border border-gray-200 shadow-lg rounded-lg
                       flex items-center px-1 py-0.5 pointer-events-auto select-none"
            style={{
                top: `${top}px`,
                left: `${left}px`,
                transform: 'translateY(-100%) translateY(-4px)',
            }}
            onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
            }}
        >
            <button
                onClick={onBold}
                title="太字 (Ctrl+B)"
                className="font-bold text-red-600 hover:bg-gray-100 px-2 py-1 rounded text-sm"
            >
                B
            </button>
            <button
                onClick={onHeading}
                title="見出し (Ctrl+H)"
                className="font-bold text-gray-700 hover:bg-gray-100 px-2 py-1 rounded text-sm"
            >
                H<sub className="text-[9px]">1</sub>
            </button>
            <button
                onClick={onList}
                title="箇条書き (Ctrl+L)"
                className="text-gray-700 hover:bg-gray-100 px-2 py-1 rounded text-sm"
            >
                ≡
            </button>
            <button
                onClick={onCheckbox}
                title="チェック (Ctrl+Shift+C)"
                className="text-gray-700 hover:bg-gray-100 px-2 py-1 rounded text-sm"
            >
                ☑
            </button>
        </div>
    );
}
