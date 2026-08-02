import { describe, expect, it, vi } from 'vitest';
import { loadPwaLanguage, PWA_LANGUAGE_STORAGE_KEY, savePwaLanguage } from './language';

describe('PWA language setting', () => {
  it('defaults to Japanese when no setting has been saved', () => {
    expect(loadPwaLanguage({ getItem: () => null })).toBe('ja');
  });

  it('restores English only when the user selected it', () => {
    expect(loadPwaLanguage({ getItem: () => 'en' })).toBe('en');
  });

  it('saves the selected language on this PWA device', () => {
    const setItem = vi.fn();
    savePwaLanguage({ setItem }, 'en');
    expect(setItem).toHaveBeenCalledWith(PWA_LANGUAGE_STORAGE_KEY, 'en');
  });
});
