import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize, PhysicalPosition } from '@tauri-apps/api/dpi';
import { suspendGeometryPersistence } from './temporaryWindowGeometry';

export function croppedNoteSize(imageWidth: number, contentHeight: number, original: { width: number; height: number }, available: { width: number; height: number }) {
    return {
        width: Math.min(original.width, available.width, Math.max(160, Math.ceil(imageWidth + 16))),
        height: Math.min(original.height, available.height, Math.max(100, Math.ceil(contentHeight + 16))),
    };
}
const layoutReady = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

export async function fitCroppedNote(imageWidth: number, contentHeight: () => number) {
    const resume = suspendGeometryPersistence();
    try {
        const win = getCurrentWindow();
        const [physical, position, factor, monitor] = await Promise.all([
            win.innerSize(), win.outerPosition(), win.scaleFactor(), currentMonitor(),
        ]);
        const original = { width: physical.width / factor, height: physical.height / factor };
        const area = monitor?.workArea;
        const available = area ? { width: area.size.width / factor, height: area.size.height / factor } : original;
        const first = croppedNoteSize(imageWidth, original.height, original, available);
        await win.setSize(new LogicalSize(first.width, first.height));
        await layoutReady();
        const fitted = croppedNoteSize(imageWidth, contentHeight(), original, available);
        await win.setSize(new LogicalSize(fitted.width, fitted.height));
        if (area) {
            const outer = await win.outerSize();
            await win.setPosition(new PhysicalPosition(
                Math.max(area.position.x, Math.min(position.x, area.position.x + area.size.width - outer.width)),
                Math.max(area.position.y, Math.min(position.y, area.position.y + area.size.height - outer.height)),
            ));
        }
    } finally {
        resume();
    }
}
