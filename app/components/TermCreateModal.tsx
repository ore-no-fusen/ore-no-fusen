'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { emit } from '@tauri-apps/api/event';
import { createTermNote } from '@/app/api/recipes';
import { buildTermDraft, splitTermNameAndBody } from '@/app/utils/termFormat';
import { type CrystalTypeFormat } from '@/app/utils/crystalFormatConfig';
import { LAUNCHER_SHELF_CHANGED_EVENT } from '@/app/utils/launcherEvents';
import { getCrystalNameFromSection, removeEmptyCrystalSections } from '@/app/utils/crystalFormat';
import { configToSpec } from '@/app/utils/crystalFormatConfigCore';
import CrystalCreateModalShell from './CrystalCreateModalShell';
import { NOTE_COLORS } from '@/app/utils/noteAppearance';
import { loadLocalizedCrystalFormats } from '@/app/utils/crystalFormatEditor';
import { useSettings } from '@/lib/settings-store';

type TermCreateModalProps = {
    sourceTitle?: string | null;
    sourceBody: string;
    sourceTags: string[];
    onClose: () => void;
    onCreated?: () => void;
};

export default function TermCreateModal({
    sourceTitle,
    sourceBody,
    sourceTags,
    onClose,
    onCreated,
}: TermCreateModalProps) {
    const { settings } = useSettings();
    const isEnglish = settings.language === 'en';
    const fallbackTitle = sourceTitle?.trim() ?? '';
    const [draftBody, setDraftBody] = useState('');
    const [termFormat, setTermFormat] = useState<CrystalTypeFormat | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        loadLocalizedCrystalFormats(settings.language).then((formats) => {
            if (!cancelled) setTermFormat(formats.term);
        });
        return () => { cancelled = true; };
    }, [settings.language]);

    useEffect(() => {
        if (!termFormat) return;
        const { name, rest } = splitTermNameAndBody(sourceBody);
        const initialTermName = name || sourceTitle?.trim() || '';
        setDraftBody(buildTermDraft({
            sourceTitle,
            termName: initialTermName,
            sourceBody: rest,
            date: new Date(),
        }, termFormat));
    }, [sourceBody, sourceTitle, termFormat]);

    const handleCreate = useCallback(async () => {
        if (isCreating) return;
        setIsCreating(true);
        setError(null);
        try {
            const spec = termFormat ? configToSpec(termFormat) : null;
            const body = spec ? removeEmptyCrystalSections(spec, draftBody) : draftBody;
            const nameLabel = termFormat?.sections.find((section) => section.slot === 'name')?.label;
            const title = spec && nameLabel
                ? getCrystalNameFromSection(spec, draftBody, nameLabel) || fallbackTitle
                : fallbackTitle;
            const path = await createTermNote({
                title,
                body,
                tags: sourceTags,
            });
            await emit('fusen:open_note', { path, isNew: false, backgroundColor: NOTE_COLORS.gray });
            await emit(LAUNCHER_SHELF_CHANGED_EVENT);
            onCreated?.();
            onClose();
        } catch (e) {
            console.error('[TermCreateModal] Failed to create term:', e);
            setError(isEnglish ? 'Failed to create the term' : '用語の作成に失敗しました');
        } finally {
            setIsCreating(false);
        }
    }, [draftBody, fallbackTitle, isCreating, isEnglish, onClose, onCreated, sourceTags, termFormat]);

    return (
        <CrystalCreateModalShell
            onClose={onClose}
            onCreate={handleCreate}
            createLabel={isEnglish ? 'Create Term' : '用語を作る'}
            isCreating={isCreating}
            language={settings.language}
        >
                <label className="flex min-h-0 flex-1 flex-col gap-1">
                    <span className="pr-8 text-xs text-gray-500">{isEnglish ? 'You can create it as-is. Delete only the lines you do not need.' : 'そのまま作れます。不要な行だけ削除してください'}</span>
                    {error && <div className="text-sm text-red-600">{error}</div>}
                    <textarea
                        autoFocus
                        aria-label={isEnglish ? 'Term draft' : '用語の叩き台'}
                        className="min-h-0 flex-1 resize-none overflow-y-auto px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono leading-snug focus:outline-none focus:ring-2 focus:ring-slate-500 bg-gray-50"
                        value={draftBody}
                        onChange={(e) => setDraftBody(e.target.value)}
                    />
                </label>
        </CrystalCreateModalShell>
    );
}
