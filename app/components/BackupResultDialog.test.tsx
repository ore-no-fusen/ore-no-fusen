import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BackupResultDialog from './BackupResultDialog'

afterEach(cleanup)

describe('BackupResultDialog', () => {
    it('shows an unmistakable success result and backup facts', () => {
        render(
            <BackupResultDialog
                status="success"
                path="C:\\Users\\test\\Documents\\OreNoFusen_Backup\\Monthly"
                fileCount={42}
                completedAt="2026-07-12T10:00:00+09:00"
                nextPromptAt="2026-08-11T10:00:00+09:00"
                onClose={() => undefined}
            />,
        )

        expect(screen.getByText('バックアップが完了しました')).toBeTruthy()
        expect(screen.getByText('42件')).toBeTruthy()
        expect(screen.getByText('今回の実行日時')).toBeTruthy()
        expect(screen.getByText('次回の確認予定')).toBeTruthy()
        expect(screen.getByText(/OreNoFusen_Backup/)).toBeTruthy()
    })

    it('keeps the result visible until the user closes it', () => {
        const onClose = vi.fn()
        render(<BackupResultDialog status="error" errorMessage="Disk full" onClose={onClose} />)

        expect(screen.getByText('既存のバックアップはそのまま保持されています。')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
        expect(onClose).toHaveBeenCalledOnce()
    })

    it('shows all fixed result text in English when English is selected', () => {
        render(
            <BackupResultDialog
                language="en"
                status="success"
                path="C:\\Users\\test\\Documents\\OreNoFusen_Backup\\Monthly"
                fileCount={3}
                completedAt="2026-07-22T10:00:00+09:00"
                onClose={() => undefined}
            />,
        )

        expect(screen.getByText('Backup completed')).toBeTruthy()
        expect(screen.getByText('Files saved')).toBeTruthy()
        expect(screen.getByText('3')).toBeTruthy()
        expect(screen.getByText('Completed at')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
    })
})
