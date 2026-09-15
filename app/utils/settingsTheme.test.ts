import { describe, expect, it } from 'vitest'
import { normalizeSettingsTheme, resolveSettingsTheme } from './settingsTheme'

describe('settings theme', () => {
    it('uses the system preference for missing or unknown persisted values', () => {
        expect(normalizeSettingsTheme(undefined)).toBe('system')
        expect(normalizeSettingsTheme('sepia')).toBe('system')
        expect(normalizeSettingsTheme('')).toBe('system')
    })

    it('keeps supported selections and resolves system preference', () => {
        expect(normalizeSettingsTheme('dark')).toBe('dark')
        expect(normalizeSettingsTheme('system')).toBe('system')
        expect(resolveSettingsTheme('system', true)).toBe('dark')
        expect(resolveSettingsTheme('system', false)).toBe('light')
        expect(resolveSettingsTheme('light', true)).toBe('light')
    })
})
