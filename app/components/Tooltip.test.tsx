import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Tooltip from './Tooltip';

describe('Tooltip', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('右寄せ表示の矢印を対象ボタンの中央へ合わせる', () => {
        vi.useFakeTimers();
        render(
            <Tooltip text="「俺の付箋」へしまう" placement="top-right-arrow-shifted">
                <button type="button">しまう</button>
            </Tooltip>,
        );

        const button = screen.getByRole('button', { name: 'しまう' });
        const wrapper = button.parentElement as HTMLSpanElement;
        vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue({
            top: 100,
            bottom: 124,
            left: 200,
            right: 248,
            width: 48,
            height: 24,
            x: 200,
            y: 100,
            toJSON: () => ({}),
        });

        fireEvent.pointerEnter(wrapper);
        act(() => vi.advanceTimersByTime(150));

        expect(document.querySelector('.fusen-tooltip')?.getAttribute('data-arrow')).toBe('rpx-24');
    });
});
