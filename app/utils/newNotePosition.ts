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
