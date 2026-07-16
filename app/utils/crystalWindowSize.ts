const DEFAULT_CRYSTAL_WIDTH = 460;
const DEFAULT_CRYSTAL_HEIGHT = 560;

export function physicalCrystalWindowSize(
    savedWidth: number | undefined,
    savedHeight: number | undefined,
    scaleFactor: number,
): { width: number; height: number } {
    const width = savedWidth ?? DEFAULT_CRYSTAL_WIDTH;
    const height = savedHeight ?? DEFAULT_CRYSTAL_HEIGHT;
    const scale = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
    return {
        width: Math.round(width * scale),
        height: Math.round(height * scale),
    };
}

export function physicalCrystalWindowPosition(
    savedX: number | undefined,
    savedY: number | undefined,
    scaleFactor: number,
): { x: number; y: number } | undefined {
    if (savedX === undefined || savedY === undefined) return undefined;
    const scale = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
    return {
        x: Math.round(savedX * scale),
        y: Math.round(savedY * scale),
    };
}
