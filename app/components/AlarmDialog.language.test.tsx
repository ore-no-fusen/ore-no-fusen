import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AlarmDialog from './AlarmDialog';
import { getTranslation } from '@/lib/i18n';

describe('AlarmDialog language', () => {
    it('passes the English locale to the Windows/WebView datetime input', () => {
        const { container } = render(
            <AlarmDialog
                isOpen
                existingAlarmAt={null}
                existingAlarmSound
                onConfirm={vi.fn()}
                onClear={vi.fn()}
                onCancel={vi.fn()}
                t={getTranslation('en')}
                language="en"
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Date & Time' }));
        const input = container.querySelector('input[type="datetime-local"]');
        expect(input).not.toBeNull();
        expect(input!.getAttribute('lang')).toBe('en-US');
    });
});
