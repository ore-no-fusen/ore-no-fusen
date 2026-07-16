import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StickyActionIcon from './StickyActionIcon';

describe('StickyActionIcon', () => {
    it.each(['archive', 'delete'] as const)('%s はOS絵文字に依存せずSVGで描画する', (kind) => {
        const { container } = render(<StickyActionIcon kind={kind} />);

        expect(container.querySelector('svg')).not.toBeNull();
        expect(container.textContent).toBe('');
    });
});
