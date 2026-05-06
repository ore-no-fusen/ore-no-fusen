'use client';

import React from 'react';

type PinTackIconProps = {
    active: boolean;
    size?: number;
};

export default function PinTackIcon({ active, size = 20 }: PinTackIconProps) {
    const headGradientId = active ? 'pin-head-gradient-active' : 'pin-head-gradient-inactive';
    const needleGradientId = active ? 'pin-needle-gradient-active' : 'pin-needle-gradient-inactive';
    const headStart = active ? '#FF5A49' : '#E8E8E8';
    const headEnd = active ? '#C92720' : '#8A8A8A';
    const headRim = active ? '#A9201C' : '#6F6F6F';
    const needleStart = active ? '#F5F0E6' : '#F1F1F1';
    const needleEnd = active ? '#6F746F' : '#9B9B9B';
    const slashColor = '#6B7280';

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
        >
            <defs>
                <radialGradient id={headGradientId} cx="34%" cy="26%" r="72%">
                    <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.75" />
                    <stop offset="20%" stopColor={headStart} />
                    <stop offset="100%" stopColor={headEnd} />
                </radialGradient>
                <linearGradient id={needleGradientId} x1="7.4" y1="17.2" x2="14.2" y2="10.4">
                    <stop offset="0%" stopColor={needleStart} />
                    <stop offset="48%" stopColor={needleEnd} />
                    <stop offset="100%" stopColor="#3F443F" />
                </linearGradient>
            </defs>
            <ellipse cx="9" cy="18.3" rx="4.1" ry="0.9" fill="#000000" opacity="0.12" />
            <path
                d="M7.7 17.5l6.8-6.8"
                stroke={`url(#${needleGradientId})`}
                strokeWidth="2.1"
                strokeLinecap="round"
            />
            <path
                d="M7.1 18.1l1.8-3.4 1.6 1.6-3.4 1.8z"
                fill={active ? '#A9ACA7' : '#C8C8C8'}
            />
            <circle cx="16.1" cy="8.2" r="4.35" fill={`url(#${headGradientId})`} stroke={headRim} strokeWidth="0.45" />
            <ellipse cx="14.7" cy="6.5" rx="1.25" ry="0.85" fill="#FFFFFF" opacity="0.55" transform="rotate(-30 14.7 6.5)" />
            <path d="M12.5 10.9c1.2 1.6 3.5 2.2 5.4 1.5" stroke={active ? '#8C1C19' : '#5F5F5F'} strokeWidth="0.55" opacity={active ? 0.35 : 0.26} strokeLinecap="round" />
            {!active && (
                <path
                    d="M5.1 19.5L19.4 5.2"
                    stroke={slashColor}
                    strokeWidth="2"
                    strokeLinecap="round"
                    opacity="0.36"
                />
            )}
        </svg>
    );
}
