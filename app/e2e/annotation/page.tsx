'use client';

import { Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import ImageAnnotationModal from '@/app/components/ImageAnnotationModal';

function AnnotationE2EPageContent() {
    const searchParams = useSearchParams();
    const absolutePath = searchParams.get('path') ?? '';
    const displayUrl = searchParams.get('url') ?? '';
    const language = searchParams.get('lang') === 'en' ? 'en' : 'ja';

    const markResult = useCallback((result: 'saved' | 'cancelled') => {
        document.documentElement.dataset.annotationE2eResult = result;
    }, []);

    if (!absolutePath || !displayUrl) {
        return (
            <main data-testid="annotation-e2e-error" className="p-6">
                <h1 className="text-lg font-bold">Annotation E2E setup error</h1>
                <p>Query parameters `path` and `url` are required.</p>
            </main>
        );
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
