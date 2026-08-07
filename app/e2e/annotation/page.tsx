'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { convertFileSrc } from '@tauri-apps/api/core';
import ImageAnnotationModal from '@/app/components/ImageAnnotationModal';

function AnnotationE2EPageContent() {
    const searchParams = useSearchParams();
    const absolutePath = searchParams.get('path') ?? '';
    const language = searchParams.get('lang') === 'en' ? 'en' : 'ja';
    const [displayUrl, setDisplayUrl] = useState('');

    useEffect(() => {
        if (!absolutePath) {
            setDisplayUrl('');
            return;
        }

        // convertFileSrc は browser/Tauri runtime 前提のため、SSRでは呼ばない。
        setDisplayUrl(convertFileSrc(absolutePath));
    }, [absolutePath]);

    const markResult = useCallback((result: 'saved' | 'cancelled') => {
        document.documentElement.dataset.annotationE2eResult = result;
    }, []);

    if (!absolutePath) {
        return (
            <main data-testid="annotation-e2e-error" className="p-6">
                <h1 className="text-lg font-bold">Annotation E2E setup error</h1>
                <p>Query parameter `path` is required.</p>
            </main>
        );
    }

    if (!displayUrl) {
        return <main data-testid="annotation-e2e-loading">Loading…</main>;
    }

    return (
        <main data-testid="annotation-e2e-page">
            <ImageAnnotationModal
                absolutePath={absolutePath}
                displayUrl={displayUrl}
                language={language}
                onSaved={() => markResult('saved')}
                onCancel={() => markResult('cancelled')}
            />
        </main>
    );
}

export default function AnnotationE2EPage() {
    return (
        <Suspense fallback={<main data-testid="annotation-e2e-loading">Loading…</main>}>
            <AnnotationE2EPageContent />
        </Suspense>
    );
}
