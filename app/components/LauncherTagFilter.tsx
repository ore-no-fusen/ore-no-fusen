'use client';

import React, { useId, useLayoutEffect, useRef, useState } from 'react';

type Option = { value: string; label: string };
type Props = {
    options: Option[];
    value: string;
    allValue: string;
    english: boolean;
    onChange: (value: string) => void;
    onCollapse?: () => void;
    onContextMenu: (value: string, event: React.MouseEvent<HTMLButtonElement>) => void;
    actionTitle?: string;
    children?: React.ReactNode;
};

const chip = 'shrink-0 rounded-full px-2.5 text-[11px]';

export default function LauncherTagFilter({ options, value, allValue, english, onChange, onCollapse, onContextMenu, actionTitle, children }: Props) {
    const [expanded, setExpanded] = useState(false);
    const [fitting, setFitting] = useState<string[]>([]);
    const space = useRef<HTMLDivElement>(null);
    const measures = useRef<HTMLDivElement>(null);
    const toggle = useRef<HTMLButtonElement>(null);
    const regionId = useId();

    useLayoutEffect(() => {
        const fit = () => {
            const width = space.current?.getBoundingClientRect().width ?? 0;
            const widths = new Map(Array.from(measures.current?.children ?? []).map((node, index) =>
                [options[index].value, node.getBoundingClientRect().width] as const));
            // The selection has priority only in the compact row. Expanded order stays unchanged.
            const selected = options.find(option => option.value === value);
            const ordered = selected ? [selected, ...options.filter(option => option !== selected)] : options;
            const next: string[] = [];
            let used = 0;
            for (const option of ordered) {
                const measured = widths.get(option.value) ?? 0;
                const size = option.value === value ? Math.min(measured, width) : measured;
                if (used + (next.length ? 4 : 0) + size > width) break;
                next.push(option.value);
                used += (next.length > 1 ? 4 : 0) + size;
            }
            setFitting(old => old.join('\0') === next.join('\0') ? old : next);
        };
        fit();
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
        if (space.current) observer?.observe(space.current);
        if (measures.current) observer?.observe(measures.current);
        window.addEventListener('resize', fit);
        return () => { observer?.disconnect(); window.removeEventListener('resize', fit); };
    }, [options, value, expanded]);

    const shown = expanded ? options : fitting.map(key => options.find(option => option.value === key)!).filter(Boolean);
    const collapse = () => { setExpanded(false); onCollapse?.(); };
    const select = (next: string) => { onChange(next); collapse(); };
    const color = (key: string) => key === value ? 'bg-sky-500 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700';

    return <div role="group" aria-label={english ? 'Tag filter' : 'タグ区分'} className="relative flex min-h-7 shrink-0 items-start gap-1"
        onKeyDown={event => {
            if (event.key === 'Escape' && expanded) {
                event.preventDefault(); event.stopPropagation(); collapse(); toggle.current?.focus();
            }
        }}>
        <div aria-hidden="true" className="pointer-events-none absolute h-0 w-0 overflow-hidden">
            <div ref={measures} className="flex w-max gap-1">
                {options.map(option => <span key={option.value} className={`${chip} h-7 inline-flex items-center whitespace-nowrap`}>{option.label}</span>)}
            </div>
        </div>
        <button type="button" aria-pressed={value === allValue} onClick={() => select(allValue)} className={`${chip} h-7 ${color(allValue)}`}>
            {english ? 'All' : 'すべて'}
        </button>
        <div ref={space} className="min-w-0 flex-1">
            <div id={regionId} style={expanded ? { scrollbarColor: '#71717a #18181b', scrollbarWidth: 'thin' } : undefined}
                className={`flex gap-1 ${expanded ? 'max-h-[min(40vh,14rem)] flex-wrap overflow-y-auto' : 'overflow-hidden'}`}>
                {shown.map(option => <button key={option.value} type="button" aria-pressed={value === option.value}
                    onClick={() => select(option.value)} onContextMenu={event => onContextMenu(option.value, event)}
                    title={`${option.label}${actionTitle ? ` — ${actionTitle}` : ''}`}
                    className={`${chip} max-w-full ${expanded ? 'h-auto min-h-7 whitespace-normal break-all py-1 text-left' : 'h-7 truncate'} ${color(option.value)}`}>
                    {option.label}
                </button>)}
            </div>
        </div>
        <button ref={toggle} type="button" aria-expanded={expanded} aria-controls={regionId}
            onClick={() => expanded ? collapse() : setExpanded(true)} className="h-7 shrink-0 rounded px-2 text-[11px] text-zinc-300 hover:bg-zinc-800">
            {expanded ? (english ? 'Collapse ▴' : '折りたたむ ▴') : (english ? 'All tags ▾' : 'すべてのタグ ▾')}
        </button>
        {children}
    </div>;
}
