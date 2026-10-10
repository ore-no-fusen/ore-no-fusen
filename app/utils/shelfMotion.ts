export const SHELF_ENTER_MS = 200;
export const SHELF_RETURN_MS = 150;
export async function playShelfMotion(element: HTMLElement | null, action: 'enter' | 'return'): Promise<void> {
    if (!element || typeof element.animate !== 'function'
        || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const frames = action === 'enter'
        ? [{ transform: 'translateY(10px) scale(.94)', opacity: 0 },
           { transform: 'translateY(-1px) scale(1)', opacity: 1, offset: .8 },
           { transform: 'none', opacity: 1 }]
        : [{ transform: 'none', opacity: 1 },
           { transform: 'translateY(4px) scale(.94)', opacity: 0 }];
    const animation = element.animate(frames, {
        duration: action === 'enter' ? SHELF_ENTER_MS : SHELF_RETURN_MS,
        easing: action === 'enter' ? 'cubic-bezier(.2,.8,.3,1)' : 'ease-in',
    });
    try {
        await Promise.race([animation.finished, new Promise<void>(resolve => setTimeout(resolve, 300))]);
    } catch { /* OS motion cancellation is harmless. */ }
    finally { animation.cancel(); }
}
// Hide promptly while saving; a failed transaction restores the same live window.
export async function storeFavoriteInOrder(
    save: () => Promise<boolean>,
    store: () => Promise<void>,
    motion: () => Promise<void>,
    close: () => Promise<void>,
    restore: () => Promise<void>,
): Promise<boolean> {
    try {
        try { await motion(); } catch { /* Optional animation must not block storage. */ }
        await close();
        if (!await save()) { await restore(); return false; }
        await store();
        return true;
    } catch (error) {
        await restore();
        throw error;
    }
}
