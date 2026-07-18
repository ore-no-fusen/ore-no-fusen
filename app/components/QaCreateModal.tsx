'use client';

import { useCallback, useEffect, useState } from 'react';
import { emit } from '@tauri-apps/api/event';
import { createQaNote } from '@/app/api/recipes';
import { buildQaDraft } from '@/app/utils/qaFormat';
import { splitTermNameAndBody } from '@/app/utils/termFormat';
import { loadCrystalFormats, type CrystalTypeFormat } from '@/app/utils/crystalFormatConfig';
import { LAUNCHER_SHELF_CHANGED_EVENT } from '@/app/utils/launcherEvents';
import { getCrystalNameFromSection, removeEmptyCrystalSections } from '@/app/utils/crystalFormat';
import { configToSpec } from '@/app/utils/crystalFormatConfigCore';
import CrystalCreateModalShell from './CrystalCreateModalShell';
import { NOTE_COLORS } from '@/app/utils/noteAppearance';

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
    const fallbackTitle =
        splitTermNameAndBody(sourceBody).name || sourceTitle?.trim() || '';
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
            const spec = qaFormat ? configToSpec(qaFormat) : null;
            const body = spec ? removeEmptyCrystalSections(spec, draftBody) : draftBody;
            const questionLabel = qaFormat?.sections.find((section) => section.slot === 'question')?.label;
            const title = spec && questionLabel
                ? getCrystalNameFromSection(spec, draftBody, questionLabel) || fallbackTitle
                : fallbackTitle;
            const path = await createQaNote({
                title,
                body,
                tags: sourceTags,
            });
            await emit('fusen:open_note', { path, isNew: false, backgroundColor: NOTE_COLORS.gray });
            await emit(LAUNCHER_SHELF_CHANGED_EVENT);
            onCreated?.();
            onClose();
        } catch (e) {
            console.error('[QaCreateModal] Failed to create QA:', e);
            setError('QAの作成に失敗しました');
        } finally {
            setIsCreating(false);
        }
    }, [draftBody, fallbackTitle, isCreating, onClose, onCreated, qaFormat, sourceTags]);

    return (
        <CrystalCreateModalShell
            onClose={onClose}
            onCreate={handleCreate}
            createLabel="QAを作る"
            isCreating={isCreating}
        >
                <label className="flex min-h-0 flex-1 flex-col gap-1">
                    <span className="pr-8 text-xs text-gray-500">そのまま作れます。不要な行だけ削除してください</span>
                    {error && <div className="text-sm text-red-600">{error}</div>}
                    <textarea
                        autoFocus
                        aria-label="QAの叩き台"
                        className="min-h-0 flex-1 resize-none overflow-y-auto px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono leading-snug focus:outline-none focus:ring-2 focus:ring-slate-500 bg-gray-50"
                        value={draftBody}
                        onChange={(e) => setDraftBody(e.target.value)}
                    />
                </label>
        </CrystalCreateModalShell>
    );
}
