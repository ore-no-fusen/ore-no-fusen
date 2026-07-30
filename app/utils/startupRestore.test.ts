import { describe, expect, it, vi } from 'vitest';
import {
    partitionStartupLabels,
    runWithConcurrency,
    STARTUP_INITIAL_READY_TIMEOUT_MS,
    STARTUP_RETRY_READY_TIMEOUT_MS,
    waitForStartupReady,
} from './startupRestore';

describe('startup restore', () => {
    it('初回は4秒、再試行後は12秒まで準備完了を待つ', () => {
        expect(STARTUP_INITIAL_READY_TIMEOUT_MS).toBe(4_000);
        expect(STARTUP_RETRY_READY_TIMEOUT_MS).toBe(12_000);
    });

    it('付箋準備の同時実行数を2枚までに制限する', async () => {
        let active = 0;
        let maxActive = 0;
        await runWithConcurrency([1, 2, 3, 4, 5], 2, async () => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await new Promise((resolve) => setTimeout(resolve, 5));
            active -= 1;
        });
        expect(maxActive).toBe(2);
    });

    it('準備完了通知が欠けても指定時間で待機を終了する', async () => {
        vi.useFakeTimers();
        const unsubscribe = vi.fn();
        let resolved = false;
        const waiting = waitForStartupReady(
            new Set(['note-1', 'note-2']),
            new Set(['note-1']),
            () => unsubscribe,
            4000,
        ).then(() => { resolved = true; });

        await vi.advanceTimersByTimeAsync(3999);
        expect(resolved).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await waiting;
        expect(resolved).toBe(true);
        expect(unsubscribe).toHaveBeenCalledOnce();
        vi.useRealTimers();
    });

    it('準備未完了の付箋を表示対象から分離する', () => {
        const result = partitionStartupLabels(
            new Set(['note-1', 'note-2', 'note-3']),
            new Set(['note-1', 'note-3']),
        );

        expect(result.ready).toEqual(['note-1', 'note-3']);
        expect(result.missing).toEqual(['note-2']);
    });

    it('準備完了が0件なら全付箋を未準備として返す', () => {
        const result = partitionStartupLabels(
            new Set(['note-1', 'note-2']),
            new Set(),
        );

        expect(result.ready).toEqual([]);
        expect(result.missing).toEqual(['note-1', 'note-2']);
    });
});
