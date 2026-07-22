import { describe, expect, it } from 'vitest';
import { getSettingsPageText } from './settingsPageText';

describe('getSettingsPageText', () => {
    it('returns English labels without Japanese characters in English mode', () => {
        const values = JSON.stringify(getSettingsPageText('en'));

        expect(values).not.toMatch(/[ぁ-んァ-ヶ一-龯]/);
        expect(getSettingsPageText('en').sidebar.hotkeys).toBe('Hotkeys');
        expect(getSettingsPageText('en').templates.types.recipe).toBe('Recipe');
    });

    it('keeps Japanese labels in Japanese mode', () => {
        expect(getSettingsPageText('ja').sidebar.templates).toBe('ひな形');
    });
});
