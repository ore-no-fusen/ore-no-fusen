'use client';

import React from 'react';

type PinTackIconProps = {
    active: boolean;
    size?: number;
};

export default function PinTackIcon({ active, size = 20 }: PinTackIconProps) {
    const headColor = active ? '#E84D6A' : '#D8A4AD';
    const headShadow = active ? '#B92D4A' : '#B98A92';
    const needleColor = active ? '#8B93A1' : '#B9C0CA';
    const highlightColor = active ? '#FF9BAE' : '#E9C5CB';
    const slashColor = '#6B7280';

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
        >
            <g transform="rotate(-35 12 12)">
                <path
                    d="M12 13.3v6.2"
                    stroke={needleColor}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                />
                <path
                    d="M7.3 9.7h9.4"
                    stroke={headShadow}
                    strokeWidth="3.1"
                    strokeLinecap="round"
                />
                <circle cx="12" cy="8.8" r="4.1" fill={headColor} />
                <path
                    d="M9.1 11.1c1.6 1.2 4.2 1.2 5.8 0"
                    stroke={headShadow}
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    opacity="0.75"
                />
                <circle cx="10.5" cy="6.8" r="1" fill={highlightColor} />
            </g>
            {!active && (
                <path
                    d="M5.6 5.4l12.8 13.2"
                    stroke={slashColor}
                    strokeWidth="2"
                    strokeLinecap="round"
                    opacity="0.82"
                />
            )}
        </svg>
    );
}
