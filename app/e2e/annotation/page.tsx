'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import ImageAnnotationModal from '@/app/components/ImageAnnotationModal';

const waitFor = async (predicate: () => boolean, message: string, timeoutMs = 20_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(message);
};

const findButton = (label: string) => Array.from(document.querySelectorAll('button'))
    .find((button) => button.textContent?.trim() === label) as HTMLButtonElement | undefined;

const captureKonvaStage = () => {
    const layers = Array.from(document.querySelectorAll<HTMLCanvasElement>('.konvajs-content canvas'));
    if (layers.length === 0) throw new Error('Konva canvas was not found');
    const output = document.createElement('canvas');
    output.width = layers[0].width;
    output.height = layers[0].height;
    const context = output.getContext('2d');
    if (!context) throw new Error('Evidence canvas context was not available');
    for (const layer of layers) context.drawImage(layer, 0, 0);
    return output.toDataURL('image/png');
};

const dispatchMouse = (target: Element, type: string, x: number, y: number, buttons: number) => {
    target.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        buttons,
        button: 0,
        view: window,
    }));
};

function AnnotationE2EPageContent() {
    const searchParams = useSearchParams();
    const absolutePath = searchParams.get('path') ?? '';
    const evidenceDir = searchParams.get('evidenceDir') ?? '';
    const autoRun = searchParams.get('autorun') === '1';
    const language = searchParams.get('lang') === 'en' ? 'en' : 'ja';
    const startedRef = useRef(false);
    const [autoRunStatus, setAutoRunStatus] = useState('waiting');
    const displayUrl = useMemo(() => {
        if (!absolutePath) return '';
        if (/^(data:|blob:|https?:)/i.test(absolutePath)) return absolutePath;
        if (typeof window === 'undefined') return '';
        return convertFileSrc(absolutePath);
    }, [absolutePath]);

    const markResult = useCallback((result: 'saved' | 'cancelled') => {
        document.documentElement.dataset.annotationE2eResult = result;
    }, []);

    useEffect(() => {
        if (!autoRun || !absolutePath || !evidenceDir || startedRef.current) return;
        startedRef.current = true;

        const saveEvidence = async (name: string, data: string) => {
            await invoke('fusen_save_annotated_image', {
                path: `${evidenceDir}\\${name}`,
                data,
            });
        };

        const run = async () => {
            await invoke('fusen_debug_log', { message: '[MSIX ANNOTATION E2E] route loaded' });
            setAutoRunStatus('waiting-for-canvas');
            await waitFor(() => Boolean(document.querySelector('.konvajs-content canvas')), 'Konva canvas did not load');
            await invoke('fusen_debug_log', { message: '[MSIX ANNOTATION E2E] canvas loaded' });
            await saveEvidence('01-original-before-annotation.png', captureKonvaStage());

            const stage = document.querySelector('.konvajs-content');
            const pen = findButton('ペン');
            if (!stage || !pen) throw new Error('Annotation controls were not found');
            pen.click();

            const box = stage.getBoundingClientRect();
            const startX = box.left + box.width * 0.2;
            const startY = box.top + box.height * 0.3;
            const endX = box.left + box.width * 0.75;
            const endY = box.top + box.height * 0.7;
            dispatchMouse(stage, 'mousedown', startX, startY, 1);
            for (let step = 1; step <= 12; step += 1) {
                dispatchMouse(
                    stage,
                    'mousemove',
                    startX + ((endX - startX) * step) / 12,
                    startY + ((endY - startY) * step) / 12,
                    1,
                );
            }
            dispatchMouse(stage, 'mouseup', endX, endY, 0);

            const callout = findButton('吹き出し');
            if (!callout) throw new Error('Callout control was not found');
            const originalPrompt = window.prompt;
            window.prompt = () => 'MSIX保存テスト';
            try {
                callout.click();
                const calloutX = box.left + box.width * 0.58;
                const calloutY = box.top + box.height * 0.42;
                dispatchMouse(stage, 'mousedown', calloutX, calloutY, 1);
                dispatchMouse(stage, 'mouseup', calloutX, calloutY, 0);
            } finally {
                window.prompt = originalPrompt;
            }

            await waitFor(() => !findButton('元に戻す')?.disabled, 'Draw operations were not recorded');
            await saveEvidence('02-annotated-before-save.png', captureKonvaStage());

            setAutoRunStatus('saving');
            const save = findButton('保存');
            if (!save) throw new Error('Save control was not found');
            save.click();
            await waitFor(
                () => document.documentElement.dataset.annotationE2eResult === 'saved',
                'The real Tauri save command did not complete',
            );

            const response = await fetch(convertFileSrc(absolutePath), { cache: 'no-store' });
            if (!response.ok) throw new Error(`Saved PNG reopen failed: ${response.status}`);
            const reopenedBlob = await response.blob();
            const reopenedUrl = URL.createObjectURL(reopenedBlob);
            try {
                const image = new Image();
                image.src = reopenedUrl;
                await image.decode();
                const reopened = document.createElement('canvas');
                reopened.width = image.naturalWidth;
                reopened.height = image.naturalHeight + 44;
                const context = reopened.getContext('2d');
                if (!context) throw new Error('Reopen evidence context was not available');
                context.fillStyle = '#111827';
                context.fillRect(0, 0, reopened.width, reopened.height);
                context.fillStyle = '#ffffff';
                context.font = 'bold 20px sans-serif';
                context.fillText(`Saved PNG reopened (${reopenedBlob.size} bytes)`, 12, 29);
                context.drawImage(image, 0, 44);
                await saveEvidence('04-saved-output-reopened.png', reopened.toDataURL('image/png'));
            } finally {
                URL.revokeObjectURL(reopenedUrl);
            }

            document.documentElement.dataset.msixAnnotationE2e = 'passed';
            setAutoRunStatus('passed');
            await invoke('fusen_debug_log', { message: '[MSIX ANNOTATION E2E] passed' });
        };

        void run().catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            document.documentElement.dataset.msixAnnotationE2e = `failed:${message}`;
            setAutoRunStatus(`failed:${message}`);
            void invoke('fusen_debug_log', { message: `[MSIX ANNOTATION E2E] failed: ${message}` });
            console.error('[MSIX ANNOTATION E2E]', error);
        });
    }, [absolutePath, autoRun, evidenceDir]);

    if (!absolutePath) {
        return (
            <main data-testid="annotation-e2e-error" className="p-6">
                <h1 className="text-lg font-bold">Annotation E2E setup error</h1>
                <p>Query parameter `path` is required.</p>
            </main>
        );
    }

    return (
        <main data-testid="annotation-e2e-page">
            {autoRun && <output data-testid="msix-annotation-status" className="sr-only">{autoRunStatus}</output>}
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
