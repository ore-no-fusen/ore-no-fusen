/**
 * SaveErrorToast - 保存失敗通知バナー
 *
 * 責務:
 * - 自動保存が全リトライ失敗したことをユーザーに通知
 * - 付箋ウィンドウ下部に固定表示（ブロッキングしない）
 * - ユーザーが確認して閉じることができる
 */

'use client';

import React, { useEffect, useState } from 'react';

type SaveErrorToastProps = {
    isVisible: boolean;
    onDismiss: () => void;
};

export default function SaveErrorToast({ isVisible, onDismiss }: SaveErrorToastProps) {
    const [isAnimatingIn, setIsAnimatingIn] = useState(false);

    useEffect(() => {
        if (isVisible) {
            // 次のフレームでアニメーション開始（マウント直後に transition を効かせるため）
            const t = requestAnimationFrame(() => setIsAnimatingIn(true));
            return () => cancelAnimationFrame(t);
        } else {
            setIsAnimatingIn(false);
        }
    }, [isVisible]);

    if (!isVisible) return null;

    return (
        <div
            role="alert"
            aria-live="assertive"
            style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 99999,
                padding: '10px 12px',
                backgroundColor: '#dc2626',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                boxShadow: '0 -2px 8px rgba(0,0,0,0.25)',
                // フェードイン
                opacity: isAnimatingIn ? 1 : 0,
                transform: isAnimatingIn ? 'translateY(0)' : 'translateY(8px)',
                transition: 'opacity 0.2s ease, transform 0.2s ease',
            }}
        >
            {/* アイコン＋メッセージ */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600, lineHeight: 1.4 }}>
                <span style={{ fontSize: '16px', flexShrink: 0 }}>⚠️</span>
                <span>
                    自動保存に失敗しました。<br />
                    <span style={{ fontWeight: 400, opacity: 0.85 }}>
                        保存先の接続、空き容量、書き込み権限を確認してください。編集中の内容は画面を閉じずに残してください。
                    </span>
                </span>
            </div>

            {/* 閉じるボタン */}
            <button
                onClick={onDismiss}
                aria-label="閉じる"
                style={{
                    flexShrink: 0,
                    background: 'rgba(255,255,255,0.2)',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#ffffff',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 700,
                    padding: '4px 8px',
                    lineHeight: 1,
                }}
            >
                ✕
            </button>
        </div>
    );
}
