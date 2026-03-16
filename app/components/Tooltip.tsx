'use client';

import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

type TooltipProps = {
    text: string;
    hint?: string;
    children: React.ReactNode;
    placement?: 'top' | 'top-right';
};

type TipPos = {
    top: number;
    left?: number;
    right?: number;
    flipDown: boolean;
};

/** ツールチップ表示に必要な最低高さ (px) */
const TIP_HEIGHT = 40;

export default function Tooltip({ text, hint, children, placement = 'top-right' }: TooltipProps) {
    const [tipPos, setTipPos] = useState<TipPos | null>(null);
    const wrapperRef = useRef<HTMLSpanElement>(null);
    const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const calcPos = useCallback(() => {
        const el = wrapperRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        // ボタン上端に十分なスペースがなければ下向きに
        const flipDown = r.top < TIP_HEIGHT;
        const base = flipDown ? r.bottom + 6 : r.top - 6;

        if (placement === 'top-right') {
            setTipPos({ top: base, right: window.innerWidth - r.right, flipDown });
        } else {
            setTipPos({ top: base, left: r.left + r.width / 2, flipDown });
        }
    }, [placement]);

    const handleEnter = () => {
        showTimer.current = setTimeout(() => {
            calcPos();
        }, 150);
    };

    const handleLeave = () => {
        if (showTimer.current) clearTimeout(showTimer.current);
        setTipPos(null);
    };

    const tipStyle: React.CSSProperties | null = tipPos
        ? {
            position: 'fixed',
            zIndex: 9999,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            animation: 'tooltip-pop 0.1s ease-out both',
            top: tipPos.top,
            ...(tipPos.left !== undefined
                ? { left: tipPos.left, transform: tipPos.flipDown ? 'translateX(-50%)' : 'translateX(-50%) translateY(-100%)' }
                : { right: tipPos.right, transform: tipPos.flipDown ? 'none' : 'translateY(-100%)' }),
            transformOrigin: tipPos.flipDown ? 'top center' : 'bottom center',
        }
        : null;

    const tooltip = tipPos && tipStyle ? createPortal(
        <span className={`fusen-tooltip${tipPos.flipDown ? ' fusen-tooltip--down' : ''}`} style={tipStyle}>
            <span style={{ display: 'block', fontSize: '11px', color: '#444', fontWeight: 500 }}>{text}</span>
            {hint && (
                <span style={{ display: 'block', fontSize: '10px', color: '#999', marginTop: '2px' }}>{hint}</span>
            )}
        </span>,
        document.body
    ) : null;

    return (
        <span
            ref={wrapperRef}
            style={{ position: 'relative', display: 'inline-flex' }}
            onPointerEnter={handleEnter}
            onPointerLeave={handleLeave}
        >
            {children}
            {tooltip}
        </span>
    );
}
