/**
 * PoolWaitToast - Pool 枯渇時の「少々お待ちください」トースト
 *
 * 責務:
 * - Pool 窓が全スロット使用中のとき（連打 4 個目以降）に表示
 * - Ctrl+N を押した付箋の近く（座標指定）に固定表示
 * - 1.5 秒で自動消去（onClose コールバック呼び出し）
 * - 依存追加禁止: シンプル CSS のみで実装
 */

'use client';

import React, { useEffect, useRef } from 'react';
import type { Language } from '@/lib/i18n';

type PoolWaitToastProps = {
    x: number;
    y: number;
    visible: boolean;
    language?: Language;
    onClose: () => void;
};

export default function PoolWaitToast({ x, y, visible, language = 'ja', onClose }: PoolWaitToastProps) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!visible) return;

        // 1.5 秒後に自動消去
        timerRef.current = setTimeout(() => {
            onClose();
        }, 1500);

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [visible, onClose]);

    if (!visible) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            style={{
                position: 'fixed',
                left: x,
                top: y,
                zIndex: 99999,
                padding: '8px 14px',
                backgroundColor: 'rgba(30, 30, 30, 0.88)',
                color: '#f5f5f5',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 500,
                lineHeight: 1.4,
                boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
                backdropFilter: 'blur(4px)',
                whiteSpace: 'nowrap',
                pointerEvents: 'none', // クリックを透過
                userSelect: 'none',
            }}
        >
            {language === 'en' ? 'Please wait…' : '少々お待ちください…'}
        </div>
    );
}
