'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getCurrentWindow } from '@tauri-apps/api/window';
import TermCreateModal from '../components/TermCreateModal';
import { readNote } from '../api/notes';
import { splitFrontMatter } from '../utils/splitFrontMatter';
import { decodeNotePathFromUrl } from '../utils/pathUtils';

function TermCreateInner() {
    const params = useSearchParams();
    const rawPath = params.get('path') ?? '';
    const path = decodeNotePathFromUrl(rawPath);
    const [source, setSource] = useState<{ title: string; body: string; tags: string[] } | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        if (!path) {
            setError('元の付箋が指定されていません');
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
    }, [path]);

    const closeWindow = () => {
        getCurrentWindow().close().catch(() => {});
    };

    if (error) {
        return <div className="p-4 text-sm text-red-400">{error}</div>;
    }
    if (!source) {
        return <div className="p-4 text-sm text-zinc-400">読み込み中...</div>;
    }

    return (
        <TermCreateModal
            sourceTitle={source.title}
            sourceBody={source.body}
            sourceTags={source.tags}
            onClose={closeWindow}
        />
    );
}

export default function TermCreatePage() {
    return (
        <Suspense fallback={<div className="p-4 text-sm text-zinc-400">読み込み中...</div>}>
            <TermCreateInner />
        </Suspense>
    );
}
