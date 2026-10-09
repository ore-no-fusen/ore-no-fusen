import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize, PhysicalPosition } from '@tauri-apps/api/dpi';

// Each webview owns its own guard. In-flight reads are invalidated even if
// the whole edit session finishes before the read resolves.
let depth = 0;
let revision = 0;
let queue: Promise<void> = Promise.resolve();
export const temporaryGeometryActive = () => depth > 0;
export const geometryRevision = () => revision;

export function suspendGeometryPersistence() {
    depth++;
    revision++;
    return () => { depth--; revision++; };
}

export function beginTemporaryWindowGeometry(width: number, height: number) {
    const resume = suspendGeometryPersistence();
    let closed = false;
    let release!: () => void;
    const untilClosed = new Promise<void>(resolve => { release = resolve; });
    const task = queue.then(async () => {
        if (closed) return;
        const win = getCurrentWindow();
        const [size, position, factor, monitor] = await Promise.all([
            win.innerSize(), win.outerPosition(), win.scaleFactor(), currentMonitor(),
        ]);
        if (closed) return;
        try {
            const workArea = monitor?.workArea;
            const scale = monitor?.scaleFactor ?? factor;
            await win.setSize(new LogicalSize(
                Math.min(width, workArea ? workArea.size.width / scale : width),
                Math.min(height, workArea ? workArea.size.height / scale : height),
            ));
            if (!closed) {
                if (workArea) {
                    const outer = await win.outerSize();
                    if (!closed) await win.setPosition(new PhysicalPosition(
                        workArea.position.x + Math.max(0, Math.round((workArea.size.width - outer.width) / 2)),
                        workArea.position.y + Math.max(0, Math.round((workArea.size.height - outer.height) / 2)),
                    ));
                }
            }
            await untilClosed;
        } finally {
            // Return to the original monitor before restoring logical dimensions.
            // A move between monitors can change the DPI used by setSize.
            await win.setPosition(new PhysicalPosition(position.x, position.y));
            await win.setSize(new LogicalSize(size.width / factor, size.height / factor));
            await win.setPosition(new PhysicalPosition(position.x, position.y));
        }
    });
    queue = task.catch(error => { console.error('[ANNOTATION] window geometry failed', error); });
    const done = task.finally(resume);
    // Cleanup cannot await; still observe failures immediately.
    void done.catch(() => {});
    return () => { closed = true; release(); return done; };
}
