'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { emit } from '@tauri-apps/api/event';
import { createRecipeNote, getRecipeCandidates, RecipeCandidate } from '@/app/api/recipes';
import { readNote } from '@/app/api/notes';
import { buildRecipeDraft } from '@/app/utils/recipeFormat';
import { splitTermNameAndBody } from '@/app/utils/termFormat';
import { loadCrystalFormats, type CrystalTypeFormat } from '@/app/utils/crystalFormatConfig';
import { LAUNCHER_SHELF_CHANGED_EVENT } from '@/app/utils/launcherEvents';
import { splitFrontMatter } from '@/app/utils/splitFrontMatter';
import { getCrystalNameFromSection, removeEmptyCrystalSections } from '@/app/utils/crystalFormat';
import { configToSpec } from '@/app/utils/crystalFormatConfigCore';

type RecipeCreateModalProps = {
    sourcePath: string;
    sourceTitle?: string | null;
    sourceBody: string;
    sourceTags: string[];
    onClose: () => void;
    onCreated?: () => void;
};

function todayString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function readNoteBody(path: string): Promise<string> {
    const note = await readNote(path);
    return splitFrontMatter(note.body).body;
}

export default function RecipeCreateModal({
    sourcePath,
    sourceTitle,
    sourceBody,
    sourceTags,
    onClose,
    onCreated,
}: RecipeCreateModalProps) {
    const fallbackTitle =
        splitTermNameAndBody(sourceBody).name || sourceTitle?.trim() || '';
    const [candidates, setCandidates] = useState<{ yellows: RecipeCandidate[] }>({
        yellows: [],
    });
    const [selectedYellowPath, setSelectedYellowPath] = useState<string | null>(null);
    const [draftBody, setDraftBody] = useState('');
    const [recipeFormat, setRecipeFormat] = useState<CrystalTypeFormat | null>(null);
    const [isDraftEdited, setIsDraftEdited] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const confirmOverwriteDraft = useCallback(() => {
        if (!isDraftEdited) return true;
        return window.confirm('手編集した叩き台を材料から作り直します。よろしいですか？');
    }, [isDraftEdited]);

    useEffect(() => {
        let cancelled = false;
        loadCrystalFormats().then((formats) => {
            if (!cancelled) setRecipeFormat(formats.recipe);
        });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        setError(null);
        getRecipeCandidates(sourcePath)
            .then((result) => {
                if (cancelled) return;
                setCandidates({ yellows: result.yellows });
            })
            .catch((e) => {
                if (cancelled) return;
                console.error('[RecipeCreateModal] Failed to load candidates:', e);
                setError('材料候補の取得に失敗しました');
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });
        return () => { cancelled = true; };
    }, [sourcePath]);

    useEffect(() => {
        let cancelled = false;
        const regenerate = async () => {
            if (!recipeFormat) return;
            const yellowBody = selectedYellowPath ? await readNoteBody(selectedYellowPath) : null;
            if (cancelled) return;

            const draft = buildRecipeDraft({
                blueBody: sourceBody,
                yellowBody,
                date: todayString(),
            }, recipeFormat);
            setDraftBody(draft);
            setIsDraftEdited(false);
            setError(null);
        };

        regenerate().catch((e) => {
            if (cancelled) return;
            console.error('[RecipeCreateModal] Failed to build draft:', e);
            setError('叩き台の生成に失敗しました');
        });

        return () => { cancelled = true; };
    }, [recipeFormat, selectedYellowPath, sourceBody]);

    const selectYellow = useCallback((path: string | null) => {
        if (!confirmOverwriteDraft()) return;
        setSelectedYellowPath(path);
    }, [confirmOverwriteDraft]);

    const handleCreate = useCallback(async () => {
        if (isCreating) return;
        setIsCreating(true);
        setError(null);
        try {
            const spec = recipeFormat ? configToSpec(recipeFormat) : null;
            const body = spec ? removeEmptyCrystalSections(spec, draftBody) : draftBody;
            const situationLabel = recipeFormat?.sections.find((section) => section.slot === 'situation')?.label;
            const title = spec && situationLabel
                ? getCrystalNameFromSection(spec, draftBody, situationLabel) || fallbackTitle
                : fallbackTitle;
            const path = await createRecipeNote({
                title,
                body,
                tags: sourceTags,
            });
            await emit('fusen:open_note', { path, isNew: false, backgroundColor: '#cfd8dc' });
            await emit(LAUNCHER_SHELF_CHANGED_EVENT);
            onCreated?.();
            onClose();
        } catch (e) {
            console.error('[RecipeCreateModal] Failed to create recipe:', e);
            setError('レシピの作成に失敗しました');
        } finally {
            setIsCreating(false);
        }
    }, [draftBody, fallbackTitle, isCreating, onClose, onCreated, recipeFormat, sourceTags]);

    const noCandidates = !isLoading && candidates.yellows.length === 0;

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
                    aria-label="閉じる"
                    className="absolute right-2 top-2 z-10 px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 rounded"
                    onClick={onClose}
                >
                    ×
                </button>

                <section className="flex max-h-[36%] shrink-0 flex-col gap-1 overflow-y-auto pr-1">
                    <h4 className="pr-8 text-xs font-bold text-gray-600">材料を選ぶ</h4>
                    {isLoading && <div className="text-sm text-gray-500">材料を探しています...</div>}
                    {noCandidates && (
                        <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-2">
                            同じタグの材料はありません
                        </div>
                    )}

                    {candidates.yellows.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <div className="text-xs font-bold text-gray-500">黄色（0〜1件）— 選ぶと「きっかけ」に入ります</div>
                            {candidates.yellows.map((candidate) => (
                                <label key={candidate.path} className="flex gap-2 p-2 border border-gray-200 rounded-lg bg-[#fffdf2]">
                                    <input
                                        type="radio"
                                        name="recipe-yellow"
                                        checked={selectedYellowPath === candidate.path}
                                        onChange={() => selectYellow(candidate.path)}
                                    />
                                    <span className="min-w-0">
                                        <span className="block text-sm font-bold truncate">{candidate.title}</span>
                                        <span className="block text-xs text-gray-600 whitespace-pre-wrap break-words">{candidate.preview}</span>
                                    </span>
                                </label>
                            ))}
                            <button
                                type="button"
                                className="self-start text-xs text-gray-500 hover:text-gray-800"
                                onClick={() => selectYellow(null)}
                            >
                                黄色の選択を外す
                            </button>
                        </div>
                    )}
                </section>

                <label className="flex min-h-0 flex-1 flex-col gap-1">
                    <span className="text-xs text-gray-500">そのまま作れます。不要な行だけ削除してください</span>
                    {error && <div className="text-sm text-red-600">{error}</div>}
                    <textarea
                        autoFocus
                        aria-label="手順の叩き台"
                        className="min-h-0 flex-1 resize-none overflow-y-auto px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono leading-snug focus:outline-none focus:ring-2 focus:ring-orange-500 bg-gray-50"
                        value={draftBody}
                        onChange={(e) => {
                            setDraftBody(e.target.value);
                            setIsDraftEdited(true);
                        }}
                    />
                </label>

                <div className="flex shrink-0 justify-end gap-2">
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
                        className="px-6 py-2 text-sm font-bold text-white bg-orange-600 rounded-lg disabled:opacity-50 hover:bg-orange-700 transition-colors shadow-md"
                    >
                        レシピを作る
                    </button>
                </div>
            </div>
        </div>
    );
}
