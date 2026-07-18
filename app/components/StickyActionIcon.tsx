import React from 'react';
import { STICKY_ACTION_SYMBOLS } from '@/app/utils/stickyActionSymbols';

type StickyActionIconProps = {
    kind: 'archive' | 'delete';
};

export default function StickyActionIcon({ kind }: StickyActionIconProps) {
    const symbol = kind === 'archive'
        ? STICKY_ACTION_SYMBOLS.archive
        : STICKY_ACTION_SYMBOLS.delete;

    return <span aria-hidden="true" className="text-[15px] leading-none">{symbol}</span>;
}
