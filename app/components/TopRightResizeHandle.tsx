import React, { useEffect, useRef } from 'react';
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import { suspendGeometryPersistence } from '../utils/temporaryWindowGeometry';

export default function TopRightResizeHandle({ title, onFinished }: { title: string; onFinished: () => Promise<void> }) {
    const dragRef = useRef<{
        x: number; y: number; dx: number; dy: number; closing: boolean;
        update: () => void; finish: () => Promise<void>;
    } | null>(null);
    useEffect(() => () => { void dragRef.current?.finish(); }, []);

    return <div data-testid="sticky-top-resize-handle" title={title}
        className="absolute top-0 right-0 z-[210] h-6 w-6 cursor-nesw-resize select-none"
        style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, calc(100% - 4px) 100%, calc(100% - 4px) 4px, 0 4px)' }}
        onPointerDown={e => {
            if (e.button !== 0 || dragRef.current) return;
            e.preventDefault(); e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            const win = getCurrentWindow();
            const resume = suspendGeometryPersistence();
            const snapshot = Promise.all([win.innerSize(), win.scaleFactor()]);
            let writes: Promise<void> = Promise.resolve();
            let requested = 0, applied = 0, running = false;
            const drag = {
                x: e.screenX, y: e.screenY, dx: 0, dy: 0, closing: false,
                update: () => {
                    requested++;
                    if (running) return;
                    running = true;
                    writes = (async () => {
                        const [size, factor] = await snapshot;
                        while (applied < requested) {
                            const next = requested;
                            await win.setSize(new PhysicalSize(
                                Math.max(Math.round(160 * factor), size.width + Math.round(drag.dx * factor)),
                                Math.max(Math.round(100 * factor), size.height - Math.round(drag.dy * factor)),
                            ));
                            applied = next;
                        }
                    })().finally(() => { running = false; });
                    void writes.catch(() => {});
                },
                finish: async () => {
                    if (drag.closing) return;
                    drag.closing = true;
                    try {
                        await writes;
                        const [position, outer, monitor] = await Promise.all([win.outerPosition(), win.outerSize(), currentMonitor()]);
                        const area = monitor?.workArea;
                        if (area) await win.setPosition(new PhysicalPosition(
                            Math.max(area.position.x, Math.min(position.x, area.position.x + area.size.width - outer.width)),
                            Math.max(area.position.y, Math.min(position.y, area.position.y + area.size.height - outer.height)),
                        ));
                    } catch (error) { console.error('top-right resize failed', error); }
                    finally { resume(); dragRef.current = null; }
                    await onFinished();
                },
            };
            dragRef.current = drag;
        }}
        onPointerMove={e => {
            const drag = dragRef.current;
            if (!drag || drag.closing) return;
            e.preventDefault(); e.stopPropagation();
            drag.dx = e.screenX - drag.x; drag.dy = e.screenY - drag.y;
            drag.update();
        }}
        onPointerUp={e => { e.stopPropagation(); void dragRef.current?.finish(); }}
        onPointerCancel={() => { void dragRef.current?.finish(); }}
        onLostPointerCapture={() => { void dragRef.current?.finish(); }}
    />;
}
