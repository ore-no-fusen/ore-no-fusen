export function findNearestHorizontalScrollTarget(root: HTMLElement, clientX: number, clientY: number): HTMLElement | null {
    const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-horizontal-scroll-target]'))
        .filter((target) => target.scrollWidth > target.clientWidth);

    const distance = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const dx = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
        const dy = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
        return dx * dx + dy * dy;
    };

    return targets.reduce<HTMLElement | null>((nearest, target) => {
        if (!nearest) return target;
        return distance(target) < distance(nearest) ? target : nearest;
    }, null);
}

export function scrollNearestHorizontalTarget(
    root: HTMLElement,
    clientX: number,
    clientY: number,
    deltaX: number,
): boolean {
    if (deltaX === 0) return false;
    const target = findNearestHorizontalScrollTarget(root, clientX, clientY);
    if (!target) return false;
    target.scrollLeft += deltaX;
    return true;
}

export type HorizontalWheelGesture = {
    lastDeltaX: number;
    lastEventTime: number;
};

export function resolveHorizontalWheelDelta(
    gesture: HorizontalWheelGesture,
    input: { deltaX: number; deltaY: number; timeStamp: number },
    continuationMs = 250,
): number {
    if (input.deltaX !== 0) {
        gesture.lastDeltaX = input.deltaX;
        gesture.lastEventTime = input.timeStamp;
        return input.deltaX;
    }

    const elapsed = input.timeStamp - gesture.lastEventTime;
    if (
        input.deltaY === 0
        && gesture.lastDeltaX !== 0
        && elapsed >= 0
        && elapsed <= continuationMs
    ) {
        gesture.lastEventTime = input.timeStamp;
        return gesture.lastDeltaX;
    }

    gesture.lastDeltaX = 0;
    gesture.lastEventTime = input.timeStamp;
    return 0;
}
