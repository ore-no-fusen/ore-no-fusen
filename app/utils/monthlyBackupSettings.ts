import type { AppSettings } from '@/lib/settings-store'

export function monthlyBackupToggleChanges(enabled: boolean): Partial<AppSettings> {
    return enabled
        ? {
            monthly_backup_enabled: true,
            monthly_backup_skip_count: 0,
            monthly_backup_next_prompt: undefined,
        }
        : { monthly_backup_enabled: false }
}
