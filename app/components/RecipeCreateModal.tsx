'use client';

import { useCallback, useEffect, useState } from 'react';
import { emit } from '@tauri-apps/api/event';
import { createRecipeNote, getRecipeCandidates, RecipeCandidate } from '@/app/api/recipes';
import { readNote } from '@/app/api/notes';
import { buildRecipeDraft } from '@/app/utils/recipeFormat';
import { loadCrystalFormats, type CrystalTypeFormat } from '@/app/utils/crystalFormatConfig';
import { LAUNCHER_SHELF_CHANGED_EVENT } from '@/app/utils/launcherEvents';
import { splitFrontMatter } from '@/app/utils/splitFrontMatter';

type RecipeCreateModalProps = {
    sourcePath: string;
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
    sourceBody,
    sourceTags,
    onClose,
    onCreated,
}: RecipeCreateModalProps) {
    const [title, setTitle] = useState('');
    const [candidates, setCandidates] = useState<{ yellows: RecipeCandidate[]; pinks: RecipeCandidate[] }>({
        yellows: [],
        pinks: [],
    });
    const [selectedYellowPath, setSelectedYellowPath] = useState<string | null>(null);
    const [selectedPinkPaths, setSelectedPinkPaths] = useState<string[]>([]);
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
                setCandidates(result);
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
            const pinkBodies = await Promise.all(selectedPinkPaths.map((path) => readNoteBody(path)));
            if (cancelled) return;

            const draft = buildRecipeDraft({
                blueBody: sourceBody,
                yellowBody,
                pinkBodies,
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
    }, [recipeFormat, selectedPinkPaths, selectedYellowPath, sourceBody]);

    const togglePink = useCallback((path: string) => {
        if (!confirmOverwriteDraft()) return;
        setSelectedPinkPaths((prev) => {
            if (prev.includes(path)) {
                return prev.filter((item) => item !== path);
            }
            if (prev.length >= 3) {
                return prev;
            }
            return [...prev, path];
        });
    }, [confirmOverwriteDraft]);

    const selectYellow = useCallback((path: string | null) => {
        if (!confirmOverwriteDraft()) return;
        setSelectedYellowPath(path);
    }, [confirmOverwriteDraft]);

    const handleCreate = useCallback(async () => {
        if (isCreating) return;
        setIsCreating(true);
        setError(null);
        try {
            const path = await createRecipeNote({
                title,
                body: draftBody,
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
    }, [draftBody, isCreating, onClose, onCreated, sourceTags, title]);

    const noCandidates = !isLoading && candidates.yellows.length === 0 && candidates.pinks.length === 0;

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
                        <span>🍳</span> レシピにする
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-gray-50"
                        placeholder="短い名前（15文字くらいまで）"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                    <span className="text-xs text-gray-500">一覧では先頭10文字が表示されます</span>
                </label>

                <section className="flex flex-col gap-2">
                    <h4 className="text-sm font-bold">材料（候補選択）</h4>
                    {isLoading && <div className="text-sm text-gray-500">材料を探しています...</div>}
                    {noCandidates && (
                        <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
                            材料が見つかりませんでした。付箋にタグを複数つけておくと、ここに材料が出やすくなります
                        </div>
                    )}

                    {candidates.yellows.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <div className="text-xs font-bold text-gray-500">黄色（0〜1件）</div>
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

                    {candidates.pinks.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <div className="text-xs font-bold text-gray-500">桃（0〜3件）</div>
                            {candidates.pinks.map((candidate) => {
                                const checked = selectedPinkPaths.includes(candidate.path);
                                return (
                                    <label key={candidate.path} className="flex gap-2 p-2 border border-gray-200 rounded-lg bg-[#fff5f7]">
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={!checked && selectedPinkPaths.length >= 3}
                                            onChange={() => togglePink(candidate.path)}
                                        />
                                        <span className="min-w-0">
                                            <span className="block text-sm font-bold truncate">{candidate.title}</span>
                                            <span className="block text-xs text-gray-600 whitespace-pre-wrap break-words">{candidate.preview}</span>
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    )}
                </section>

                <label className="flex flex-col gap-1">
                    <span className="text-sm font-bold">叩き台</span>
                    {error && <div className="text-sm text-red-600">{error}</div>}
                    <textarea
                        className="min-h-[160px] flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-orange-500 bg-gray-50"
                        value={draftBody}
                        onChange={(e) => {
                            setDraftBody(e.target.value);
                            setIsDraftEdited(true);
                        }}
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
                        className="px-6 py-2 text-sm font-bold text-white bg-orange-600 rounded-lg disabled:opacity-50 hover:bg-orange-700 transition-colors shadow-md"
                    >
                        レシピを作る
                    </button>
                </div>
            </div>
        </div>
    );
}
