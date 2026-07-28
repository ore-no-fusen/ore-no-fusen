/**
 * 確認ダイアログコンポーネント
 *
 * 責務:
 * - 削除などの破壊的操作前のユーザー確認
 * - モーダル表示による操作ブロック
 */

'use client';

import React from 'react';
import type { Language } from '@/lib/i18n';

type ConfirmDialogProps = {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmText?: string; // [NEW] 確認ボタンの文言（デフォルト：「削除する」）
    cancelText?: string;  // [NEW] キャンセルボタンの文言
    language?: Language;
};

export default function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel, confirmText, cancelText, language = 'ja' }: ConfirmDialogProps) {
    if (!isOpen) return null;
    const resolvedConfirmText = confirmText ?? (language === 'en' ? 'Delete' : '削除する');
    const resolvedCancelText = cancelText ?? (language === 'en' ? 'Cancel' : 'キャンセル');

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            backgroundColor: 'rgba(0, 0, 0, 0.5)'
        }}>
            <div style={{
                backgroundColor: '#fff',
                borderRadius: '8px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                maxWidth: '24rem',
                width: '100%',
                padding: '24px'
            }}>
                <h3 style={{
                    fontSize: '1.125rem',
                    fontWeight: 700,
                    color: '#111827',
                    marginBottom: '8px'
                }}>{title}</h3>
                <p style={{
                    fontSize: '0.875rem',
                    color: '#4b5563',
                    marginBottom: '24px',
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.6
                }}>
                    {message}
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '8px 16px',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            color: '#374151',
                            backgroundColor: '#f3f4f6',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer'
                        }}
                    >
                        {resolvedCancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        style={{
                            padding: '8px 16px',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            color: '#ffffff',
                            backgroundColor: '#dc2626',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                        }}
                    >
                        {resolvedConfirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
