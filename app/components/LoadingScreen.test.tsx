import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LoadingScreen from './LoadingScreen';

const { setSize, center, show, setFocus } = vi.hoisted(() => ({
    setSize: vi.fn(),
    center: vi.fn(),
    show: vi.fn(),
    setFocus: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => ({
    getCurrentWindow: () => ({ label: 'main', setSize, center, show, setFocus }),
}));

vi.mock('@tauri-apps/api/dpi', () => ({
    LogicalSize: class LogicalSize {
        constructor(public width: number, public height: number) {}
    },
}));

vi.mock('next/image', () => ({
    default: (props: Record<string, unknown>) => <img {...props} />,
}));

describe('LoadingScreen', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('設定画面へ切り替わった後に起動サイズへ戻さない', async () => {
        vi.useFakeTimers();
        const view = render(<LoadingScreen />);
        await act(async () => { await Promise.resolve(); });

        view.unmount();
        await act(async () => { vi.advanceTimersByTime(100); });

        expect(setSize).not.toHaveBeenCalled();
        expect(show).not.toHaveBeenCalled();
    });
});
