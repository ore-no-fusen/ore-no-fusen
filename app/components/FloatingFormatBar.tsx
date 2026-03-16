'use client';

import React from 'react';
import Tooltip from './Tooltip';

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
            <Tooltip text="太字" hint="Ctrl+B">
                <button
                    onClick={onBold}
                    aria-label="太字"
                    className="font-bold text-red-600 hover:bg-gray-100 px-2 py-1 rounded text-sm"
                >
                    B
                </button>
            </Tooltip>
            <Tooltip text="見出し" hint="Ctrl+H">
                <button
                    onClick={onHeading}
                    className="font-bold text-gray-700 hover:bg-gray-100 px-2 py-1 rounded text-sm"
                >
                    H<sub className="text-[9px]">1</sub>
                </button>
            </Tooltip>
            <Tooltip text="箇条書き" hint="Ctrl+L">
                <button
                    onClick={onList}
                    className="text-gray-700 hover:bg-gray-100 px-2 py-1 rounded text-sm"
                >
                    ≡
                </button>
            </Tooltip>
            <Tooltip text="チェック" hint="Ctrl+Shift+C">
                <button
                    onClick={onCheckbox}
                    className="text-gray-700 hover:bg-gray-100 px-2 py-1 rounded text-sm"
                >
                    ☑
                </button>
            </Tooltip>
        </div>
    );
}
