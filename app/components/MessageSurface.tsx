'use client';

import React, { type HTMLAttributes } from 'react';

/** Shared viewport bounds for temporary messages, including long errors. */
export default function MessageSurface({ style, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} style={{
    boxSizing: 'border-box',
    minWidth: 0,
    maxWidth: 'calc(100vw - 16px)',
    maxHeight: 'calc(100dvh - 16px)',
    overflowY: 'auto',
    overflowWrap: 'anywhere',
    ...style,
  }}>{children}</div>;
}

export function MessageBody({ style, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} style={{ minHeight: 0, minWidth: 0, overflowY: 'auto', overflowWrap: 'anywhere', flex: '1 1 auto', ...style }} />;
}

export function MessageActions({ style, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} style={{ flexShrink: 0, display: 'flex', flexWrap: 'wrap', gap: 12, ...style }} />;
}
