import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StickyActionIcon from './StickyActionIcon';
import { STICKY_ACTION_SYMBOLS } from '@/app/utils/stickyActionSymbols';

describe('StickyActionIcon', () => {
    it.each(['archive', 'delete'] as const)('%s は右クリックと同じ共通記号を描画する', (kind) => {
        const { container } = render(<StickyActionIcon kind={kind} />);

        expect(container.querySelector('svg')).toBeNull();
        expect(container.textContent).toBe(STICKY_ACTION_SYMBOLS[kind]);
    });
});
