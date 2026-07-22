import { describe, expect, it } from 'vitest'
import { monthlyBackupToggleChanges } from './monthlyBackupSettings'

describe('monthlyBackupToggleChanges', () => {
    it('enables automatic backup and resets prompt state in one update', () => {
        expect(monthlyBackupToggleChanges(true)).toEqual({
            monthly_backup_enabled: true,
            monthly_backup_skip_count: 0,
            monthly_backup_next_prompt: undefined,
        })
    })

    it('disables automatic backup without changing its history', () => {
        expect(monthlyBackupToggleChanges(false)).toEqual({
            monthly_backup_enabled: false,
        })
    })
})
