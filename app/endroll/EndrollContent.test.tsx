import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import EndrollContent from './EndrollContent';

afterEach(() => {
    cleanup();
    window.history.replaceState({}, '', '/');
});

describe('EndrollContent', () => {
    it('uses English UI when lang=en is present in the static page URL', async () => {
        window.history.replaceState({}, '', '/endroll?lang=en');

        render(<EndrollContent />);

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Supporter Roll' })).toBeTruthy();
        });
        expect(screen.getByText('Your support helps sustain future development.')).toBeTruthy();
        expect(screen.getByText('Purchase the unlocked edition')).toBeTruthy();
    });
});
