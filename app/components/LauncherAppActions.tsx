'use client';

import React, { useState } from 'react';
import { emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getTranslation } from '@/lib/i18n';

export default function LauncherAppActions({ english, disabled, onBusy, onError }: {
    english: boolean; disabled: boolean; onBusy: (busy: boolean) => void; onError: (error: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const ja = getTranslation('ja');
    const en = getTranslation('en');
    const actions: Array<{ ja: string; en: string; run: () => Promise<unknown> }> = [
        { ja: '新規メモ', en: 'New note', run: () => emit('fusen:create_note_from_tray') },
        { ja: '全文検索', en: 'Full-text search', run: () => emit('fusen:open_search') },
        { ja: ja('menu.restoreFiled'), en: en('menu.restoreFiled'), run: () => emit('fusen:open_archive_restore') },
        { ja: 'タグで整列', en: 'Arrange by tag', run: () => invoke('fusen_arrange_by_tag') },
        { ja: '整列を元に戻す', en: 'Undo arrangement', run: () => invoke('fusen_arrange_undo') },
        { ja: ja('menu.hideAllTemporarily'), en: en('menu.hideAllTemporarily'), run: () => emit('fusen:set_all_notes_visible', false) },
        { ja: ja('menu.showTemporarilyHidden'), en: en('menu.showTemporarilyHidden'), run: () => emit('fusen:set_all_notes_visible', true) },
        { ja: '設定', en: 'Settings', run: () => emit('fusen:open_settings', {}) },
    ];
    const run = async (action: () => Promise<unknown>) => {
        if (disabled) return;
        setOpen(false); onBusy(true);
        try { await action(); } catch (e) { onError(String(e)); }
        finally { onBusy(false); }
    };
    return <>
        <button type="button" disabled={disabled} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(v => !v)}
            className="rounded px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-50">{english ? 'Actions' : '操作'} ▾</button>
        {open && <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div role="menu" aria-label={english ? 'App actions' : 'アプリ操作'} className="fixed right-2 top-9 z-50 min-w-56 rounded border border-zinc-600 bg-zinc-900 py-1 text-sm text-zinc-100 shadow-xl"
                onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }}>
                {actions.map((action, i) => <button autoFocus={i === 0} key={action.en} role="menuitem" type="button" disabled={disabled}
                    onClick={() => void run(action.run)} className="block w-full px-3 py-2 text-left hover:bg-zinc-700">{english ? action.en : action.ja}</button>)}
            </div>
        </>}
    </>;
}
