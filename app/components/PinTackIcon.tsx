'use client';

import React from 'react';

type PinTackIconProps = {
    active: boolean;
    size?: number;
};

export default function PinTackIcon({ active, size = 20 }: PinTackIconProps) {
    const slashColor = active ? 'transparent' : '#6B7280';
    const pinColor = active ? '#9CA3AF' : '#AEB4BE';
    const highlightColor = active ? '#FCA5A5' : '#D1D5DB';
    const shadowColor = active ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.12)';

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
        >
            <ellipse cx="12" cy="18.2" rx="3.4" ry="1.1" fill={shadowColor} />
            <path d="M12 11v7" stroke={pinColor} strokeWidth="2.1" strokeLinecap="round" />
            <circle cx="12" cy="7" r="4.4" fill="currentColor" />
            <circle cx="10.7" cy="5.7" r="1.1" fill={highlightColor} />
            {!active && (
                <path d="M6 5l12 12" stroke={slashColor} strokeWidth="2.2" strokeLinecap="round" />
            )}
        </svg>
    );
}
