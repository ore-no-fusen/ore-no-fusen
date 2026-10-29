type WorkArea = { position: { x: number; y: number }; size: { width: number; height: number } };

/** Coordinates and size use physical pixels, including monitors left of the primary screen. */
export function centeredNoteBounds(workArea: WorkArea, scale: number) {
    const width = Math.min(workArea.size.width, Math.round(400 * scale));
    const height = Math.min(workArea.size.height, Math.round(300 * scale));
    return {
        x: workArea.position.x + Math.round((workArea.size.width - width) / 2),
        y: workArea.position.y + Math.round((workArea.size.height - height) / 2),
        width,
        height,
    };
}

export async function currentScreenNoteBounds() {
    const { cursorPosition, monitorFromPoint, primaryMonitor } = await import('@tauri-apps/api/window');
    let monitor;
    try {
        const cursor = await cursorPosition();
        monitor = await monitorFromPoint(cursor.x, cursor.y);
    } catch { /* Fall back to the primary monitor, never the hidden pool's position. */ }
    monitor ??= await primaryMonitor();
    if (!monitor) throw new Error('No display is available for the new note');
    return { ...centeredNoteBounds(monitor.workArea, monitor.scaleFactor), scaleFactor: monitor.scaleFactor };
}

/** Never convert a global physical coordinate into a monitor-local logical coordinate. */
export async function placeNewNotePhysically(window: {
    setPosition(position: import('@tauri-apps/api/dpi').PhysicalPosition): Promise<void>;
    setSize(size: import('@tauri-apps/api/dpi').PhysicalSize): Promise<void>;
    show(): Promise<void>;
    setFocus(): Promise<void>;
}, bounds: { x: number; y: number; width: number; height: number }) {
    const { PhysicalPosition, PhysicalSize } = await import('@tauri-apps/api/dpi');
    // Moving between monitors changes DPI and may rescale the current size.
    // Set the final physical size only after entering the target monitor.
    await window.setPosition(new PhysicalPosition(bounds.x, bounds.y));
    await window.setSize(new PhysicalSize(bounds.width, bounds.height));
    await window.setPosition(new PhysicalPosition(bounds.x, bounds.y));
    await window.show();
    await window.setFocus();
}
