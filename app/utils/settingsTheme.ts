export type SettingsTheme = 'light' | 'dark' | 'system'

export function normalizeSettingsTheme(value: unknown): SettingsTheme {
    return value === 'dark' || value === 'system' || value === 'light' ? value : 'system'
}

export function resolveSettingsTheme(theme: SettingsTheme, systemPrefersDark: boolean): 'light' | 'dark' {
    return theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : theme
}
