import React from 'react';
import { Archive, Trash2 } from 'lucide-react';

type StickyActionIconProps = {
    kind: 'archive' | 'delete';
};

export default function StickyActionIcon({ kind }: StickyActionIconProps) {
    const Icon = kind === 'archive' ? Archive : Trash2;

    return <Icon aria-hidden="true" size={15} strokeWidth={2} />;
}
