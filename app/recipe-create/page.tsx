'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getCurrentWindow } from '@tauri-apps/api/window';
import RecipeCreateModal from '../components/RecipeCreateModal';
import { readNote } from '../api/notes';
import { splitFrontMatter } from '../utils/splitFrontMatter';
import { decodeNotePathFromUrl } from '../utils/pathUtils';
import { emit, listen } from '@tauri-apps/api/event';
import { useSettings } from '@/lib/settings-store';
import { nextRecipeDraftRequest } from '../utils/recipeDraftRequest';

function RecipeCreateInner() {
    const { settings } = useSettings();
    const isEnglish = settings.language === 'en';
    const params = useSearchParams();
    const rawPath = params.get('path') ?? '';
    const initialPath = decodeNotePathFromUrl(rawPath);
    const [request, setRequest] = useState({ path: initialPath, revision: initialPath ? 1 : 0 });
    const path = request.path;
    const [readyToken, setReadyToken] = useState<string | null>(null);
    const [source, setSource] = useState<{ title: string; body: string; tags: string[] } | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        let unlistenPing: (() => void) | undefined;
        listen<{ path: string; token: string }>('fusen:prepare_recipe_draft', (event) => {
            setSource(null);
            setError(null);
            setReadyToken(event.payload.token);
            setRequest((current) => nextRecipeDraftRequest(current, event.payload.path));
        }).then((u) => {
            unlisten = u;
            emit('fusen:recipe_draft_host_ready').catch(() => {});
        });
        listen<{ token: string }>('fusen:recipe_draft_ping', (event) => {
            emit('fusen:recipe_draft_host_ready', { token: event.payload.token }).catch(() => {});
        }).then((u) => { unlistenPing = u; });
        return () => { unlisten?.(); unlistenPing?.(); };
    }, []);

    useEffect(() => {
        let cancelled = false;
        if (!path) {
            setError(isEnglish ? 'No source note was specified' : '元の付箋が指定されていません');
            return;
        }
        readNote(path)
            .then((note) => {
                if (cancelled) return;
                const { front, body } = splitFrontMatter(note.body);
                const titleMatch = front.match(/(?:^|\n)title:\s*(.+)/);
                const tagMatch = front.match(/(?:^|\n)tags:\s*\[([^\]]*)\]/);
                const title = titleMatch ? titleMatch[1].trim().replace(/^['"]|['"]$/g, '') : '';
                const tags = tagMatch
                    ? tagMatch[1].split(',').map((t) => t.trim()).filter(Boolean)
                    : [];
                setSource({ title, body, tags });
            })
            .catch((e) => {
                if (!cancelled) setError(e instanceof Error ? e.message : String(e));
            });
        return () => {
            cancelled = true;
        };
    }, [isEnglish, path, request.revision]);

    const closeWindow = () => { getCurrentWindow().hide().catch(() => {}); };
    const notifyReady = useCallback(() => {
        if (!readyToken) return;
        emit('fusen:recipe_draft_ready', { token: readyToken }).catch(() => {});
        setReadyToken(null);
    }, [readyToken]);

    if (error) {
        return <div className="p-4 text-sm text-red-400">{error}</div>;
    }
    if (!source) {
        return <div className="p-4 text-sm text-zinc-400">{isEnglish ? 'Loading...' : '読み込み中...'}</div>;
    }

    return (
        <RecipeCreateModal
            key={path}
            sourcePath={path}
            sourceTitle={source.title}
            sourceBody={source.body}
            sourceTags={source.tags}
            onClose={closeWindow}
            onReady={notifyReady}
        />
    );
}

export default function RecipeCreatePage() {
    return (
        <Suspense fallback={<div className="p-4 text-sm text-zinc-400">Loading...</div>}>
            <RecipeCreateInner />
        </Suspense>
    );
}
