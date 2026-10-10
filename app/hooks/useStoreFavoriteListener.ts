import { useEffect, useRef } from 'react';

export interface StoreFavoriteRequest { path: string; requestId: string }

// A render must not replace the listener while a storage transaction is running.
export function useStoreFavoriteListener(handle: (request: StoreFavoriteRequest) => Promise<void>) {
    const handlerRef = useRef(handle);
    handlerRef.current = handle;
    const receivedRef = useRef(new Set<string>());
    useEffect(() => {
        let cancelled = false;
        let dispose: (() => void) | undefined;
        import('@tauri-apps/api/event').then(({ listen }) => listen<StoreFavoriteRequest>(
            'fusen:store_favorite', async ({ payload }) => {
                // Unlisten is asynchronous: stale callbacks can still arrive after cleanup.
                if (cancelled || receivedRef.current.has(payload.requestId)) return;
                receivedRef.current.add(payload.requestId);
                if (receivedRef.current.size > 64) {
                    receivedRef.current.delete(receivedRef.current.values().next().value!);
                }
                await handlerRef.current(payload);
            },
        )).then(unlisten => { if (cancelled) unlisten(); else dispose = unlisten; })
            .catch(error => console.error('[LauncherStorage] listener failed:', error));
        return () => { cancelled = true; dispose?.(); };
    }, []);
}
