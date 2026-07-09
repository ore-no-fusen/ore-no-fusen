'use client';

import { useCallback, useEffect, useState } from 'react';
import { emit } from '@tauri-apps/api/event';
import { createQaNote } from '@/app/api/recipes';
import { buildQaDraft } from '@/app/utils/qaFormat';
import { loadCrystalFormats, type CrystalTypeFormat } from '@/app/utils/crystalFormatConfig';
import { LAUNCHER_SHELF_CHANGED_EVENT } from '@/app/utils/launcherEvents';

type QaCreateModalProps = {
    sourceTitle?: string | null;
    sourceBody: string;
    sourceTags: string[];
    onClose: () => void;
    onCreated?: () => void;
};

export default function QaCreateModal({
    sourceTitle,
    sourceBody,
    sourceTags,
    onClose,
    onCreated,
}: QaCreateModalProps) {
    const [title, setTitle] = useState('');
    const [draftBody, setDraftBody] = useState('');
    const [qaFormat, setQaFormat] = useState<CrystalTypeFormat | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        loadCrystalFormats().then((formats) => {
            if (!cancelled) setQaFormat(formats.qa);
        });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!qaFormat) return;
        setDraftBody(buildQaDraft({
            sourceTitle,
            sourceBody,
            date: new Date(),
        }, qaFormat));
    }, [qaFormat, sourceBody, sourceTitle]);

    const handleCreate = useCallback(async () => {
        if (isCreating) return;
        setIsCreating(true);
        setError(null);
        try {
            const path = await createQaNote({
                title,
                body: draftBody,
                tags: sourceTags,
            });
            await emit('fusen:open_note', { path, isNew: false, backgroundColor: '#cfd8dc' });
            await emit(LAUNCHER_SHELF_CHANGED_EVENT);
            onCreated?.();
            onClose();
        } catch (e) {
            console.error('[QaCreateModal] Failed to create QA:', e);
            setError('QAの作成に失敗しました');
        } finally {
            setIsCreating(false);
        }
    }, [draftBody, isCreating, onClose, onCreated, sourceTags, title]);

    return (
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-3"
            onPointerDown={(e) => {
                e.stopPropagation();
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className="bg-white p-5 rounded-xl shadow-2xl flex flex-col gap-4 w-full max-w-[680px] max-h-full overflow-y-auto text-gray-800"
                onPointerDown={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-3">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <span>❓</span> QAにする
                    </h3>
                    <button
                        type="button"
                        className="px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 rounded"
                        onClick={onClose}
                    >
                        ×
                    </button>
                </div>

                <label className="flex flex-col gap-1">
                    <span className="text-sm font-bold">短い名前</span>
                    <input
                        autoFocus
                        type="text"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 bg-gray-50"
                        placeholder="短い名前（15文字くらいまで）"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                    <span className="text-xs text-gray-500">一覧では先頭10文字が表示されます</span>
                </label>

                <label className="flex flex-col gap-1">
                    <span className="text-sm font-bold">叩き台</span>
                    {error && <div className="text-sm text-red-600">{error}</div>}
                    <textarea
                        className="min-h-[360px] flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-slate-500 bg-gray-50"
                        value={draftBody}
                        onChange={(e) => setDraftBody(e.target.value)}
                    />
                </label>

                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        キャンセル
                    </button>
                    <button
                        type="button"
                        onClick={handleCreate}
                        disabled={isCreating}
                        className="px-6 py-2 text-sm font-bold text-white bg-slate-700 rounded-lg disabled:opacity-50 hover:bg-slate-800 transition-colors shadow-md"
                    >
                        QAを作る
                    </button>
                </div>
            </div>
        </div>
    );
}
