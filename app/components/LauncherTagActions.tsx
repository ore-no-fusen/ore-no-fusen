'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getTranslation } from '@/lib/i18n';
import { createUserTag, deleteUserTag, deleteUnusedUserTags, getUserTagCatalog, renameUserTag, stopUserTagChange, type PendingTagChange } from '../api/tags';
import { registerTag, storeTag } from '../api/launcher';

export type LauncherTagMenu = { tag: string; x: number; y: number } | null;
type Dialog = { mode: 'create' | 'rename' | 'delete'; tag: string; value: string; count: number };
type Props = {
    english: boolean;
    disabled: boolean;
    menu: LauncherTagMenu;
    closeMenu: () => void;
    onBusy: (busy: boolean) => void;
    onChanged: (old?: string, name?: string) => Promise<void>;
    onError: (error: string) => void;
};

export default function LauncherTagActions({ english, disabled, menu, closeMenu, onBusy, onChanged, onError }: Props) {
    const t = getTranslation(english ? 'en' : 'ja');
    const menuRef = useRef<HTMLDivElement>(null);
    const [menuPosition, setMenuPosition] = useState({ x: 8, y: 8 });
    useLayoutEffect(() => {
        if (!menu) return;
        const positionMenu = () => {
            const bounds = menuRef.current?.getBoundingClientRect();
            if (!bounds) return;
            setMenuPosition({
                x: Math.max(8, Math.min(menu.x, window.innerWidth - bounds.width - 8)),
                y: Math.max(8, Math.min(menu.y, window.innerHeight - bounds.height - 8)),
            });
        };
        positionMenu();
        window.addEventListener('resize', positionMenu);
        return () => window.removeEventListener('resize', positionMenu);
    }, [menu, english]);
    const [dialog, setDialog] = useState<Dialog | null>(null);
    const [manageTags, setManageTags] = useState(false);
    const managerRef = useRef<HTMLDivElement>(null);
    useEffect(() => { if (manageTags) managerRef.current?.focus(); }, [manageTags]);
    const [catalogTags, setCatalogTags] = useState<string[]>([]);
    const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
    const [createdOrder, setCreatedOrder] = useState<Record<string, number>>({});
    const [unusedOnly, setUnusedOnly] = useState(false);
    const [unusedSelection, setUnusedSelection] = useState<Set<string>>(new Set());
    const [confirmUnused, setConfirmUnused] = useState(false);
    const [cleanupMessage, setCleanupMessage] = useState('');
    const [pending, setPending] = useState<PendingTagChange | null>(null);
    const [running, setRunning] = useState(false);
    const inFlight = useRef(false);
    const [error, setError] = useState('');
    useEffect(() => {
        let cancelled = false;
        getUserTagCatalog().then(view => { if (!cancelled) setPending(view?.pending ?? null); }).catch(() => {});
        return () => { cancelled = true; };
    }, []);

    const open = async (mode: Dialog['mode'] | 'manage', tag = '', value = '') => {
        if (inFlight.current || disabled) return;
        inFlight.current = true;
        closeMenu(); setError('');
        try {
            const view = await getUserTagCatalog();
            setPending(view.pending);
            setCatalogTags(view.tags);
            setTagCounts(view.counts);
            setCreatedOrder(view.created_order ?? {});
            if (view.pending) {
                setManageTags(false);
                const p = view.pending;
                setDialog({ mode: p.new === null ? 'delete' : 'rename', tag: p.old, value: p.new ?? '', count: view.counts[p.old] ?? 0 });
            } else if (mode === 'manage') {
                setUnusedOnly(false); setUnusedSelection(new Set()); setConfirmUnused(false); setCleanupMessage('');
                setDialog(null); setManageTags(true);
            } else {
                setManageTags(false);
                setDialog({ mode, tag, value: mode === 'rename' ? tag : value, count: view.counts[tag] ?? 0 });
            }
        } catch (e) { onError(String(e)); }
        finally { inFlight.current = false; }
    };
    const cleanUnused = async () => {
        if (!unusedSelection.size || !confirmUnused || inFlight.current || disabled) return;
        inFlight.current = true; setRunning(true); onBusy(true); setError('');
        try {
            const result = await deleteUnusedUserTags([...unusedSelection]);
            setUnusedSelection(new Set()); setConfirmUnused(false);
            setCleanupMessage(english ? `${result.changed} unused tags deleted.` : `${result.changed}件の未使用タグを削除しました。`);
            let refreshError = '';
            try {
                const view = await getUserTagCatalog();
                setCatalogTags(view.tags); setTagCounts(view.counts); setCreatedOrder(view.created_order ?? {}); setPending(view.pending);
            } catch (e) {
                setCatalogTags([]);
                refreshError = english ? 'Deletion finished. Reopen tag management to refresh the list: ' + String(e) : '削除処理は完了しました。一覧を再取得できないため、タグ管理を開き直してください: ' + String(e);
            }
            setError([...result.failed, refreshError].filter(Boolean).join('\n'));
            await onChanged();
        } catch (e) { setError(String(e)); }
        finally { inFlight.current = false; setRunning(false); onBusy(false); }
    };
    const submit = async () => {
        if (!dialog || inFlight.current || disabled) return;
        inFlight.current = true;
        setRunning(true); onBusy(true); setError('');
        try {
            const result = dialog.mode === 'create' ? (await createUserTag(dialog.value), null)
                : dialog.mode === 'rename' ? await renameUserTag(dialog.tag, dialog.value)
                : await deleteUserTag(dialog.tag);
            const view = await getUserTagCatalog();
            setPending(view.pending);
            if (result?.failed.length) await onChanged();
            else await onChanged(dialog.tag || undefined,
                dialog.mode === 'delete' ? undefined : dialog.value.trim());
            if (result?.failed.length) {
                setError(`${english ? 'Completed' : '変更済み'}: ${result.changed} / ${english ? 'Failed' : '未完了'}: ${result.failed.length}\n${result.failed.join('\n')}`);
            } else setDialog(null);
        } catch (e) { setError(String(e)); }
        finally { inFlight.current = false; setRunning(false); onBusy(false); }
    };
    const bulk = async (tag: string, store: boolean) => {
        if (inFlight.current || disabled) return;
        inFlight.current = true;
        closeMenu(); setRunning(true); onBusy(true); onError('');
        try {
            const result = await (store ? storeTag(tag) : registerTag(tag));
            await onChanged();
            if (result.failed.length) onError(result.failed.join('\n'));
        } catch (e) { onError(String(e)); }
        finally { inFlight.current = false; setRunning(false); onBusy(false); }
    };
    const title = dialog?.mode === 'create' ? (english ? 'Create tag' : 'タグを追加')
        : dialog?.mode === 'rename' ? (english ? 'Rename tag' : 'タグ名を変更')
        : (english ? 'Delete tag' : 'タグを削除');
    return <>
        <button type="button" disabled={disabled || running} aria-label={english ? 'Create tag' : 'タグを追加'}
            title={english ? 'Create or manage tags' : 'タグの追加・管理（付箋への割り当ては後からできます）'}
            className="shrink-0 rounded-full bg-zinc-800 px-2 py-1 text-sm text-zinc-200 disabled:opacity-50"
            onClick={() => void open('create')}>＋</button>
        {pending && <button type="button" disabled={disabled || running} onClick={() => void open('rename')}
            className="shrink-0 rounded border border-amber-600 px-2 py-1 text-xs text-amber-200">{english ? 'Resume tag change' : 'タグ変更を再試行'}</button>}
        {menu && <>
            <div className="fixed inset-0 z-40" onClick={closeMenu} onContextMenu={e => { e.preventDefault(); closeMenu(); }} />
            <div ref={menuRef} role="menu" aria-label={english ? 'Tag actions' : 'タグ操作'} className="fixed z-50 overflow-y-auto rounded border border-zinc-600 bg-zinc-900 py-1 text-sm shadow-xl"
                style={{ left: menuPosition.x, top: menuPosition.y, width: 'max-content', minWidth: 'min(12rem, calc(100vw - 16px))', maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100dvh - 16px)' }}>
                <button role="menuitem" disabled={disabled || running} title={english ? 'Register notes without changing their visibility' : '画面の表示状態を変えず、ランチャーに登録します'} className="block w-full px-3 py-2 text-left hover:bg-zinc-700" onClick={() => void bulk(menu.tag, false)}>{t('launcher.registerTag')}</button>
                <button role="menuitem" disabled={disabled || running} title={english ? 'Register notes in the launcher and hide them from the desktop' : '未登録分もランチャーに登録し、画面から隠します'} className="block w-full px-3 py-2 text-left hover:bg-zinc-700" onClick={() => void bulk(menu.tag, true)}>{t('launcher.registerHideTag')}</button>
                <button role="menuitem" disabled={disabled || running} className="block w-full px-3 py-2 text-left hover:bg-zinc-700" onClick={() => void open('rename', menu.tag)}>{english ? 'Rename tag' : 'タグ名を変更'}</button>
                <button role="menuitem" disabled={disabled || running} className="block w-full px-3 py-2 text-left text-red-200 hover:bg-zinc-700" onClick={() => void open('delete', menu.tag)}>{english ? 'Delete tag from all notes' : 'タグを削除（すべての付箋から外す）'}</button>
            </div>
        </>}
        {manageTags && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape' && !running) { if (confirmUnused) setConfirmUnused(false); else setManageTags(false); } }}>
            <div ref={managerRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={english ? 'Manage tags' : 'タグ管理'} className="flex max-h-full w-full max-w-md flex-col gap-3 rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-sm shadow-xl">
                <h2 className="font-bold">{english ? 'Manage tags' : 'タグ管理'}</h2>
                <p className="text-zinc-400">{english ? 'Usage counts include filed notes. Unused tags are kept until you choose to delete them.' : '使用件数にはフォルダーに保管した付箋も含みます。未使用タグは、選んで削除するまで残ります。'}</p>
                {confirmUnused ? <div role="alertdialog" aria-label={english ? 'Confirm unused-tag deletion' : '未使用タグの削除確認'} className="min-h-0 overflow-y-auto">
                    <p>{english ? `Delete ${unusedSelection.size} selected unused tags? Notes will not be changed. Tags that are now in use will be kept.` : `選んだ${unusedSelection.size}件の未使用タグを削除します。付箋は変更しません。使用中になったタグは残します。`}</p>
                    <ul className="my-3 list-inside list-disc">{[...unusedSelection].map(tag => <li key={tag} className="break-words">{tag}</li>)}</ul>
                    <div className="flex flex-wrap justify-end gap-3"><button type="button" disabled={running} onClick={() => setConfirmUnused(false)}>{english ? 'Cancel' : 'キャンセル'}</button><button type="button" disabled={running} className="rounded bg-red-900 px-3 py-2" onClick={() => void cleanUnused()}>{english ? `Delete ${unusedSelection.size} unused tags` : `${unusedSelection.size}件の未使用タグを削除`}</button></div>
                </div> : <>
                <div className="flex flex-wrap gap-3"><button type="button" disabled={running} aria-pressed={!unusedOnly} onClick={() => { setUnusedOnly(false); setUnusedSelection(new Set()); }}>{english ? 'In use' : '使用中'}</button><button type="button" disabled={running} aria-pressed={unusedOnly} onClick={() => { setUnusedOnly(true); setUnusedSelection(new Set()); }}>{english ? 'Clean up unused tags' : '未使用タグを整理'} ({catalogTags.filter(tag => !tagCounts[tag]).length})</button></div>
                {unusedOnly && <button type="button" disabled={running} className="text-left text-sky-300" onClick={() => setUnusedSelection(new Set(catalogTags.filter(tag => !tagCounts[tag])))}>{english ? 'Select all unused tags' : '未使用タグをすべて選択'}</button>}
                <div className="min-h-0 overflow-y-auto">
                    {catalogTags.filter(tag => unusedOnly ? !tagCounts[tag] : tagCounts[tag] > 0).sort((a, b) => unusedOnly ? (createdOrder[b] ?? 0) - (createdOrder[a] ?? 0) || a.localeCompare(b) : (tagCounts[b] ?? 0) - (tagCounts[a] ?? 0) || a.localeCompare(b)).map(tag => <div key={tag} className="flex flex-wrap items-center gap-2 border-b border-zinc-700 py-2">
                        {unusedOnly && <input type="checkbox" disabled={running} aria-label={english ? `Select unused tag ${tag}` : `未使用タグ${tag}を選択`} checked={unusedSelection.has(tag)} onChange={() => setUnusedSelection(current => { const next = new Set(current); if (next.has(tag)) next.delete(tag); else next.add(tag); return next; })} />}
                        <span className="min-w-0 flex-1 break-words">{tag} <span className="text-zinc-400">({tagCounts[tag] ?? 0}{english ? ' notes' : '件'})</span></span>
                        <button type="button" disabled={running} aria-label={english ? `Rename tag ${tag}` : `${tag}のタグ名を変更`} className="rounded border border-zinc-600 px-2 py-1" onClick={() => void open('rename', tag)}>{english ? 'Rename' : '名前変更'}</button>
                        <button type="button" disabled={running} aria-label={english ? `Delete tag ${tag}` : `${tag}のタグを削除`} className="rounded border border-zinc-600 px-2 py-1 text-red-200" onClick={() => { if (unusedOnly) { setUnusedSelection(new Set([tag])); setConfirmUnused(true); } else void open('delete', tag); }}>{english ? 'Delete tag' : 'タグを削除'}</button>
                    </div>)}
                    {!catalogTags.some(tag => unusedOnly ? !tagCounts[tag] : tagCounts[tag] > 0) && <p>{english ? 'No tags in this view.' : '該当するタグはありません。'}</p>}
                </div>
                <div className="flex flex-wrap justify-end gap-3">{unusedOnly && <button type="button" disabled={running || !unusedSelection.size} className="text-red-200" onClick={() => setConfirmUnused(true)}>{english ? 'Delete selected unused tags' : '選んだ未使用タグを削除'}</button>}<button type="button" disabled={running} onClick={() => void open('create')}>{english ? 'Create tag' : 'タグを追加'}</button><button type="button" disabled={running} onClick={() => setManageTags(false)}>{english ? 'Close' : '閉じる'}</button></div>
                </>}
                {cleanupMessage && <p role="status">{cleanupMessage}</p>}
                {error && <p role="alert" className="whitespace-pre-wrap text-red-200">{error}</p>}
            </div>
        </div>}
        {dialog && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape' && !running) setDialog(null); }}>
            <form role="dialog" aria-modal="true" aria-label={title} className="flex max-h-full w-full max-w-md flex-col gap-3 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-sm shadow-xl"
                onSubmit={e => { e.preventDefault(); void submit(); }}>
                <h2 className="font-bold">{title}</h2>
                {dialog.mode === 'create' && <button type="button" className="text-left text-sky-300 underline" onClick={() => void open('manage')}>{english ? 'Manage existing tags' : 'タグの名前変更・削除・未使用整理'}</button>}
                {dialog.mode === 'delete' ? <p>{english ? `Delete “${dialog.tag}” and remove it from ${dialog.count} notes? Notes and launcher registrations will remain.`
                    : `「${dialog.tag}」を削除し、${dialog.count}件の付箋から外します。付箋本体とランチャー登録は残ります。`}</p>
                    : <label className="flex flex-col gap-2">{dialog.mode === 'rename' ? (english ? `New name for “${dialog.tag}”` : `「${dialog.tag}」の新しい名前`) : (english ? 'Tag name' : 'タグ名')}
                        <input autoFocus value={dialog.value} disabled={running || !!pending} maxLength={80} onChange={e => setDialog({ ...dialog, value: e.target.value })}
                            className="rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-zinc-100" />
                    </label>}
                {dialog.mode === 'create' && <p className="text-xs text-zinc-400">{english ? 'The tag stays available even when no notes use it.' : '付箋に付けなくても作成できます。使用0件でも残ります。'}</p>}
                {pending && <>
                    <p className="text-amber-200">{english ? 'Resume the unfinished change.' : '前回の未完了分を再試行します。'}</p>
                    <button type="button" disabled={running} className="text-left text-xs text-amber-200 underline" onClick={async () => {
                        if (inFlight.current) return;
                        inFlight.current = true; setRunning(true); onBusy(true);
                        try { await stopUserTagChange(); setPending(null); setDialog(null); await onChanged(); }
                        catch (e) { setError(String(e)); }
                        finally { inFlight.current = false; setRunning(false); onBusy(false); }
                    }}>{english ? 'Stop retrying (keep completed changes and failure records)' : '再試行を終了（変更済みの付箋と未完了の記録を残す）'}</button>
                </>}
                {error && <p role="alert" className="max-h-40 overflow-y-auto whitespace-pre-wrap break-all text-red-200">{error}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" disabled={running} onClick={() => setDialog(null)} className="rounded border border-zinc-600 px-3 py-2">{english ? 'Cancel' : 'キャンセル'}</button>
                    <button type="submit" disabled={running || disabled || (dialog.mode !== 'delete' && !dialog.value.trim())} className="rounded bg-sky-700 px-3 py-2 text-white disabled:opacity-50">
                        {running ? (english ? 'Working…' : '処理中…') : pending ? (english ? 'Retry' : '再試行') : dialog.mode === 'delete' ? (english ? 'Delete' : '削除') : (english ? 'Save' : '保存')}
                    </button>
                </div>
            </form>
        </div>}
    </>;
}
