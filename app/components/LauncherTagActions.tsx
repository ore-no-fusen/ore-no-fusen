'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createUserTag, deleteUserTag, getUserTagCatalog, renameUserTag, stopUserTagChange, type PendingTagChange } from '../api/tags';
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
    const [dialog, setDialog] = useState<Dialog | null>(null);
    const [pending, setPending] = useState<PendingTagChange | null>(null);
    const [running, setRunning] = useState(false);
    const inFlight = useRef(false);
    const [error, setError] = useState('');
    useEffect(() => {
        let cancelled = false;
        getUserTagCatalog().then(view => { if (!cancelled) setPending(view?.pending ?? null); }).catch(() => {});
        return () => { cancelled = true; };
    }, []);

    const open = async (mode: Dialog['mode'], tag = '', value = '') => {
        if (inFlight.current || disabled) return;
        inFlight.current = true;
        closeMenu(); setError('');
        try {
            const view = await getUserTagCatalog();
            setPending(view.pending);
            if (view.pending) {
                const p = view.pending;
                setDialog({ mode: p.new === null ? 'delete' : 'rename', tag: p.old, value: p.new ?? '', count: view.counts[p.old] ?? 0 });
            } else setDialog({ mode, tag, value: mode === 'rename' ? tag : value, count: view.counts[tag] ?? 0 });
        } catch (e) { onError(String(e)); }
        finally { inFlight.current = false; }
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
            title={english ? 'Create a tag without assigning it to a note' : 'タグ自体を追加（付箋への割り当ては後からできます）'}
            className="shrink-0 rounded-full bg-zinc-800 px-2 py-1 text-sm text-zinc-200 disabled:opacity-50"
            onClick={() => void open('create')}>＋</button>
        {pending && <button type="button" disabled={disabled || running} onClick={() => void open('rename')}
            className="shrink-0 rounded border border-amber-600 px-2 py-1 text-xs text-amber-200">{english ? 'Resume tag change' : 'タグ変更を再試行'}</button>}
        {menu && <>
            <div className="fixed inset-0 z-40" onClick={closeMenu} onContextMenu={e => { e.preventDefault(); closeMenu(); }} />
            <div role="menu" aria-label={english ? 'Tag actions' : 'タグ操作'} className="fixed z-50 min-w-48 rounded border border-zinc-600 bg-zinc-900 py-1 text-sm shadow-xl"
                style={{ left: menu.x, top: menu.y }}>
                <button role="menuitem" disabled={disabled || running} title={english ? 'Register notes without changing their visibility' : '画面の表示状態を変えず、ランチャーに登録します'} className="block w-full px-3 py-2 text-left hover:bg-zinc-700" onClick={() => void bulk(menu.tag, false)}>{english ? 'Register all notes with this tag' : 'このタグをまとめて登録'}</button>
                <button role="menuitem" disabled={disabled || running} title={english ? 'Register notes in the launcher and hide them from the desktop' : '未登録分もランチャーに登録し、画面から隠します'} className="block w-full px-3 py-2 text-left hover:bg-zinc-700" onClick={() => void bulk(menu.tag, true)}>{english ? 'Register and hide all notes with this tag' : 'このタグをまとめて登録して隠す'}</button>
                <button role="menuitem" disabled={disabled || running} className="block w-full px-3 py-2 text-left hover:bg-zinc-700" onClick={() => void open('rename', menu.tag)}>{english ? 'Rename tag' : 'タグ名を変更'}</button>
                <button role="menuitem" disabled={disabled || running} className="block w-full px-3 py-2 text-left text-red-200 hover:bg-zinc-700" onClick={() => void open('delete', menu.tag)}>{english ? 'Delete tag from all notes' : 'タグを削除（すべての付箋から外す）'}</button>
            </div>
        </>}
        {dialog && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape' && !running) setDialog(null); }}>
            <form role="dialog" aria-modal="true" aria-label={title} className="flex max-h-full w-full max-w-md flex-col gap-3 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-sm shadow-xl"
                onSubmit={e => { e.preventDefault(); void submit(); }}>
                <h2 className="font-bold">{title}</h2>
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
