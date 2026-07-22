'use client';

import React, { type ReactNode } from 'react';
import type { Language } from '@/lib/i18n';

type CrystalCreateModalShellProps = {
    children: ReactNode;
    onClose: () => void;
    onCreate: () => void;
    createLabel: string;
    isCreating: boolean;
    accent?: 'slate' | 'orange';
    language?: Language;
};

export default function CrystalCreateModalShell({
    children,
    onClose,
    onCreate,
    createLabel,
    isCreating,
    accent = 'slate',
    language = 'ja',
}: CrystalCreateModalShellProps) {
    const isEnglish = language === 'en';
    const createClass = accent === 'orange'
        ? 'bg-orange-600 hover:bg-orange-700'
        : 'bg-slate-700 hover:bg-slate-800';

    return (
        <div
            className="fixed inset-0 z-[1000] flex items-stretch justify-center bg-black/50 backdrop-blur-sm p-2"
            onPointerDown={(e) => {
                e.stopPropagation();
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className="relative bg-white p-3 rounded-xl shadow-2xl flex min-h-0 flex-col gap-2 w-full max-w-[680px] overflow-hidden text-gray-800"
                onPointerDown={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    aria-label={isEnglish ? 'Close' : '閉じる'}
                    className="absolute right-2 top-2 z-10 min-h-7 min-w-7 text-sm text-gray-500 hover:bg-gray-100 rounded"
                    onClick={onClose}
                >
                    ×
                </button>

                {children}

                <div className="flex shrink-0 justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="min-h-9 px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        {isEnglish ? 'Cancel' : 'キャンセル'}
                    </button>
                    <button
                        type="button"
                        onClick={onCreate}
                        disabled={isCreating}
                        className={`min-h-9 px-6 py-2 text-sm font-bold text-white rounded-lg disabled:opacity-50 transition-colors shadow-md ${createClass}`}
                    >
                        {createLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
