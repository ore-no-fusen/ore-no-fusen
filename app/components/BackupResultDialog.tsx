'use client'

import React from 'react'

type BackupResultDialogProps = {
    status: 'success' | 'error'
    path?: string
    fileCount?: number
    completedAt?: string
    nextPromptAt?: string
    errorMessage?: string
    onClose: () => void
}

function formatDateTime(value?: string): string {
    if (!value) return '未設定'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ja-JP')
}

export default function BackupResultDialog({
    status,
    path,
    fileCount,
    completedAt,
    nextPromptAt,
    errorMessage,
    onClose,
}: BackupResultDialogProps) {
    const success = status === 'success'

    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
            <section className="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl">
                <div className={`px-8 pb-7 pt-8 text-center ${success ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl font-black text-white shadow-lg ${success ? 'bg-emerald-500 shadow-emerald-200' : 'bg-red-500 shadow-red-200'}`}>
                        {success ? '✓' : '!'}
                    </div>
                    <h1 className="mt-5 text-2xl font-black tracking-tight text-slate-950">
                        {success ? 'バックアップが完了しました' : 'バックアップできませんでした'}
                    </h1>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                        {success ? '大切なデータを安全に保存しました。' : '既存のバックアップはそのまま保持されています。'}
                    </p>
                </div>

                <div className="space-y-4 px-8 py-6">
                    {success ? (
                        <>
                            <div>
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">保存先</div>
                                <div className="mt-1 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-sm leading-6 text-slate-700">{path}</div>
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <ResultValue label="保存ファイル" value={`${fileCount ?? 0}件`} />
                                <ResultValue label="今回の実行日時" value={formatDateTime(completedAt)} />
                                <ResultValue label="次回の確認予定" value={formatDateTime(nextPromptAt)} />
                            </div>
                        </>
                    ) : (
                        <div className="break-words rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
                            {errorMessage || '原因を確認できませんでした。'}
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        className={`w-full rounded-xl px-5 py-3 text-base font-bold text-white shadow-sm transition-colors ${success ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-900 hover:bg-slate-800'}`}
                    >
                        閉じる
                    </button>
                </div>
            </section>
        </main>
    )
}

function ResultValue({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-slate-100 bg-white p-3">
            <div className="text-xs font-medium text-slate-400">{label}</div>
            <div className="mt-1 text-sm font-bold leading-5 text-slate-800">{value}</div>
        </div>
    )
}
