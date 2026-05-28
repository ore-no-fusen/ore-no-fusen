'use client';

import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

type TooltipProps = {
    text: string;
    hint?: string;
    children: React.ReactNode;
    placement?: 'top' | 'top-left' | 'top-right' | 'top-right-shifted' | 'top-right-arrow-shifted';
};

type TipPos = {
    top: number;
    left?: number;
    right?: number;
    flipDown: boolean;
    arrowOffset?: number;
};

/** ツールチップ表示に必要な最低高さ (px) */
const TIP_HEIGHT = 40;
const SHIFTED_TIP_WIDTH = 62;

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
        } else if (placement === 'top-left') {
            // ボタンの左端基準で吹き出しを右方向に伸ばす（画面左端での切れを防ぐ）
            setTipPos({ top: base, left: r.left, flipDown });
        } else if (placement === 'top-right-arrow-shifted') {
            setTipPos({ top: base, right: window.innerWidth - r.right, flipDown, arrowOffset: 18 });
        } else if (placement === 'top-right-shifted') {
            const minLeft = 4 + SHIFTED_TIP_WIDTH / 2;
            const maxLeft = window.innerWidth - 4 - SHIFTED_TIP_WIDTH / 2;
            const left = Math.min(Math.max(r.left + r.width / 2 + 12, minLeft), maxLeft);
            setTipPos({ top: base, left, flipDown, arrowOffset: 18 });
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
            whiteSpace: placement === 'top-right-shifted' ? 'normal' : 'nowrap',
            width: placement === 'top-right-shifted' ? SHIFTED_TIP_WIDTH : undefined,
            boxSizing: placement === 'top-right-shifted' ? 'border-box' : undefined,
            padding: placement === 'top-right-shifted' ? '5px 6px' : undefined,
            textAlign: placement === 'top-right-shifted' ? 'center' : undefined,
            animation: 'tooltip-pop 0.1s ease-out both',
            top: tipPos.top,
            ...(tipPos.left !== undefined
                ? {
                    left: tipPos.left,
                    transform: placement === 'top-left'
                        ? (tipPos.flipDown ? 'none' : 'translateY(-100%)')
                        : (tipPos.flipDown ? 'translateX(-50%)' : 'translateX(-50%) translateY(-100%)'),
                }
                : { right: tipPos.right, transform: tipPos.flipDown ? 'none' : 'translateY(-100%)' }),
            transformOrigin: tipPos.flipDown ? 'top center' : 'bottom center',
        }
        : null;

    const tooltip = tipPos && tipStyle ? createPortal(
        <span
            className={`fusen-tooltip${tipPos.flipDown ? ' fusen-tooltip--down' : ''}`}
            data-arrow-offset={tipPos.arrowOffset}
            style={tipStyle}
        >
            {tipPos.arrowOffset !== undefined && (
                <style>{`.fusen-tooltip[data-arrow-offset="${tipPos.arrowOffset}"]::after{left:calc(50% + ${tipPos.arrowOffset}px);}`}</style>
            )}
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
