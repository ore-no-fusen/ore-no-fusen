import { describe, it, expect } from 'vitest';
import { getTranslation, translations } from './i18n';

describe('i18n Utility', () => {
    it('returns correct translation for Japanese', () => {
        const t = getTranslation('ja');
        expect(t('settings.title')).toBe('俺の付箋');
        expect(t('common.save')).toBe('保存');
    });

    it('returns correct translation for English', () => {
        const t = getTranslation('en');
        expect(t('settings.title')).toBe('OreNoFusen');
        expect(t('common.save')).toBe('Save');
    });

    it('returns key if translation is missing', () => {
        const t = getTranslation('ja');
        // @ts-ignore - Testing invalid key
        expect(t('non.existent.key')).toBe('non.existent.key');
    });

    it('has matching keys structure for both languages', () => {
        const jaKeys = Object.keys(translations.ja).sort();
        const enKeys = Object.keys(translations.en).sort();
        expect(jaKeys).toEqual(enKeys);
    });
});
