import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSettings } from './settings-store';

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => {
            store[key] = value.toString();
        }),
        removeItem: vi.fn((key: string) => {
            delete store[key];
        }),
        clear: vi.fn(() => {
            store = {};
        }),
    };
})();

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
});

// Since we are running in jsdom (vitest), window exists but __TAURI__ does not by default,
// matching the "isBrowser" condition in settings-store.ts.

describe('useSettings Hook (Browser Mode)', () => {
    beforeEach(() => {
        localStorageMock.clear();
        vi.clearAllMocks();
    });

    it('loads default settings initially', async () => {
        const { result } = renderHook(() => useSettings());

        // Wait for loading to finish (useEffect)
        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.settings.language).toBe('ja');
        expect(result.current.settings.font_size).toBe(16);
    });

    it('loads settings from localStorage if available', async () => {
        const savedSettings = {
            base_path: '/test/path',
            language: 'en',
            auto_start: true,
            font_size: 20,
            sound_enabled: false,
        };
        localStorageMock.setItem('ore-no-fusen-settings', JSON.stringify(savedSettings));

        const { result } = renderHook(() => useSettings());

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.settings.language).toBe('en');
        expect(result.current.settings.font_size).toBe(20);
        expect(result.current.settings.auto_start).toBe(true);
    });

    it('saves settings to localStorage and updates state', async () => {
        const { result } = renderHook(() => useSettings());
        await waitFor(() => expect(result.current.loading).toBe(false));

        const newSettings = {
            ...result.current.settings,
            language: 'en' as const,
            font_size: 24,
        };

        await act(async () => {
            await result.current.saveSettings(newSettings);
        });

        // State update check
        expect(result.current.settings.language).toBe('en');
        expect(result.current.settings.font_size).toBe(24);

        // localStorage check
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
            'ore-no-fusen-settings',
            expect.stringContaining('"language":"en"')
        );
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
            'ore-no-fusen-settings',
            expect.stringContaining('"font_size":24')
        );
    });
});
