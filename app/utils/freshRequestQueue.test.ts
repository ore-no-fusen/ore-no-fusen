import { describe, expect, it } from 'vitest';
import { FreshRequestQueue } from './freshRequestQueue';

describe('FreshRequestQueue', () => {
    it('受け付けた要求を順番どおり返す', () => {
        const queue = new FreshRequestQueue<string>(4, 1500);
        expect(queue.push('first', 0)).toBe(true);
        expect(queue.push('second', 10)).toBe(true);
        expect(queue.take(20)).toBe('first');
        expect(queue.take(20)).toBe('second');
    });

    it('1.5秒を過ぎた要求は後から実行しない', () => {
        const queue = new FreshRequestQueue<string>(4, 1500);
        queue.push('old', 0);
        expect(queue.take(1501)).toBeUndefined();
    });

    it('上限4件を超えた要求は受け付けない', () => {
        const queue = new FreshRequestQueue<number>(4, 1500);
        expect([1, 2, 3, 4].every((value) => queue.push(value, 0))).toBe(true);
        expect(queue.push(5, 0)).toBe(false);
    });
});
