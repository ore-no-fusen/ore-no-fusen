import { describe, expect, it } from 'vitest';
import { resolveHorizontalWheelDelta, scrollNearestHorizontalTarget } from './sideButtonHorizontalScroll';

describe('side-button horizontal scroll', () => {
    function addTable(root: HTMLElement, rect: Partial<DOMRect> = {}) {
        const table = document.createElement('div');
        table.dataset.horizontalScrollTarget = '';
        Object.defineProperties(table, {
            clientWidth: { value: 100 },
            scrollWidth: { value: 300 },
        });
        table.getBoundingClientRect = () => ({
            left: 0, right: 100, top: 0, bottom: 100,
            width: 100, height: 100, x: 0, y: 0,
            toJSON: () => ({}),
            ...rect,
        });
        root.appendChild(table);
        return table;
    }

    it('scrolls the only table even when the pointer is below it', () => {
        const root = document.createElement('article');
        const table = addTable(root);
        table.scrollLeft = 20;

        expect(scrollNearestHorizontalTarget(root, 50, 250, 30)).toBe(true);
        expect(table.scrollLeft).toBe(50);
    });

    it('scrolls the table nearest to the current pointer', () => {
        const root = document.createElement('article');
        const upper = addTable(root, { top: 0, bottom: 100 });
        const lower = addTable(root, { top: 300, bottom: 400 });

        expect(scrollNearestHorizontalTarget(root, 50, 350, 40)).toBe(true);
        expect(upper.scrollLeft).toBe(0);
        expect(lower.scrollLeft).toBe(40);
    });

    it('does not consume vertical-only movement or movement without an overflowing table', () => {
        const root = document.createElement('article');
        expect(scrollNearestHorizontalTarget(root, 0, 0, 0)).toBe(false);
        expect(scrollNearestHorizontalTarget(root, 0, 0, 30)).toBe(false);
    });

    it('scrolls when horizontal input exists even if the same event has a larger vertical component', () => {
        const root = document.createElement('article');
        const table = addTable(root);

        // The caller passes deltaX independently; a simultaneous deltaY must not suppress it.
        expect(scrollNearestHorizontalTarget(root, 50, 150, 10)).toBe(true);
        expect(table.scrollLeft).toBe(10);
    });

    it('continues the first horizontal gesture when WebView temporarily emits zero deltas', () => {
        const gesture = { lastDeltaX: 0, lastEventTime: 0 };

        expect(resolveHorizontalWheelDelta(gesture, { deltaX: 100, deltaY: 0, timeStamp: 1000 })).toBe(100);
        expect(resolveHorizontalWheelDelta(gesture, { deltaX: 0, deltaY: 0, timeStamp: 1100 })).toBe(100);
        expect(resolveHorizontalWheelDelta(gesture, { deltaX: 0, deltaY: 0, timeStamp: 1200 })).toBe(100);
    });

    it('stops completion after a pause or a vertical wheel input', () => {
        const gesture = { lastDeltaX: 0, lastEventTime: 0 };
        resolveHorizontalWheelDelta(gesture, { deltaX: 100, deltaY: 0, timeStamp: 1000 });
        expect(resolveHorizontalWheelDelta(gesture, { deltaX: 0, deltaY: 0, timeStamp: 1300 })).toBe(0);

        resolveHorizontalWheelDelta(gesture, { deltaX: 100, deltaY: 0, timeStamp: 2000 });
        expect(resolveHorizontalWheelDelta(gesture, { deltaX: 0, deltaY: 120, timeStamp: 2100 })).toBe(0);
        expect(resolveHorizontalWheelDelta(gesture, { deltaX: 0, deltaY: 0, timeStamp: 2150 })).toBe(0);
    });
});
