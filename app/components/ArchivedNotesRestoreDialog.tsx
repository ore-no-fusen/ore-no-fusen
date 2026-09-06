'use client';

import React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Language } from '@/lib/i18n';
import { safeUnlisten, safeUnlistenWhenResolved } from '../utils/safeUnlisten';
import { archivedLocations, recentArchivedNotes, searchArchivedNotes, type ArchivedNoteSummary, type RestoreArchivedNotesResult } from '../utils/archiveRestore';

type Props = { language: Language; onClose: () => void | Promise<void>; onRestored: (paths: string[]) => void | Promise<void> };

function shownDate(value: string, language: Language): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'ja-JP', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

export default function ArchivedNotesRestoreDialog({ language, onClose, onRestored }: Props) {
  const en = language === 'en';
  const [notes, setNotes] = useState<ArchivedNoteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState<{ kind: 'archive' | 'tag'; name: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<ArchivedNoteSummary | null>(null);
  const [detailBody, setDetailBody] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [result, setResult] = useState<RestoreArchivedNotesResult | null>(null);

  const loadNotes = useCallback(() => {
    setLoadError('');
    invoke<ArchivedNoteSummary[]>('fusen_list_archived_notes')
      .then(setNotes).catch(error => setLoadError(String(error))).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadNotes();
    const promise = listen('fusen:archive_changed', loadNotes);
    let unlisten: (() => void) | undefined;
    promise.then(value => { unlisten = value; });
    return () => {
      if (unlisten) safeUnlisten(unlisten);
      else safeUnlistenWhenResolved(promise);
    };
  }, [loadNotes]);

  const searched = useMemo(() => searchArchivedNotes(notes, query), [notes, query]);
  const shown = useMemo(() => {
    if (query.trim()) return searched;
    if (location) return searched.filter(note => note.locationKind === location.kind && note.locationName === location.name);
    return recentArchivedNotes(searched);
  }, [searched, query, location]);
  const locations = useMemo(() => archivedLocations(notes), [notes]);

  const toggle = (path: string) => setSelected(previous => {
    const next = new Set(previous);
    next.has(path) ? next.delete(path) : next.add(path);
    return next;
  });

  const openDetail = async (note: ArchivedNoteSummary) => {
    setDetail(note);
    setDetailBody('');
    try {
      const loaded = await invoke<{ body: string }>('fusen_read_note', { path: note.path });
      setDetailBody(loaded.body.replace(/^---\s*[\s\S]*?\s*---\s*/, ''));
    } catch {
      setDetailBody(note.preview);
    }
  };

  const restore = async () => {
    if (!selected.size || restoring) return;
    setRestoring(true);
    try {
      const response = await invoke<RestoreArchivedNotesResult>('fusen_restore_archived_notes', { paths: [...selected] });
      setResult(response);
      const restoredPaths = response.restored.map(item => item.restoredPath).filter((path): path is string => !!path);
      if (restoredPaths.length) await onRestored(restoredPaths);
      const restoredSources = new Set(response.restored.map(item => item.sourcePath));
      setNotes(current => current.filter(note => !restoredSources.has(note.path)));
      setSelected(current => new Set([...current].filter(path => !restoredSources.has(path))));
    } catch (error) {
      setResult({ restored: [], conflicts: [], failed: [{ sourcePath: '', status: 'failed', error: String(error) }] });
    } finally { setRestoring(false); }
  };

  return <div className="fixed inset-0 z-50 bg-neutral-950 text-neutral-100 flex flex-col p-5 overflow-hidden">
    <div className="flex items-center gap-3 mb-4"><button onClick={onClose} aria-label={en ? 'Close' : '閉じる'}>←</button><h1 className="text-xl font-semibold">{en ? 'Restore archived notes' : 'しまった付箋を取り出す'}</h1></div>
    <input autoFocus value={query} onChange={event => { setQuery(event.target.value); setLocation(null); }} placeholder={en ? 'Search names or text' : '名前や本文を検索'} className="rounded-lg bg-neutral-800 border border-neutral-600 px-4 py-3 mb-4" />
    {loading && <p>{en ? 'Loading…' : '読み込み中…'}</p>}
    {loadError && <p className="text-red-300">{loadError}</p>}
    {!loading && !query && !location && <div className="overflow-auto flex-1">
      <h2 className="font-semibold mb-2">{en ? 'Recently archived' : '最近しまった付箋'}</h2>
      <CardList notes={shown} selected={selected} language={language} onToggle={toggle} onDetail={openDetail} />
      <h2 className="font-semibold mt-5 mb-2">{en ? 'Browse by location' : '保存場所から探す'}</h2>
      <div className="grid grid-cols-2 gap-2">{locations.map(item => <button key={`${item.kind}:${item.name}`} onClick={() => setLocation({ kind: item.kind, name: item.name })} className="text-left rounded-lg bg-neutral-800 border border-neutral-700 px-4 py-3 hover:bg-neutral-700">📁 {item.name}<span className="float-right text-neutral-400">{item.count}{en ? '' : '枚'}</span></button>)}</div>
    </div>}
    {!loading && (query || location) && <div className="overflow-auto flex-1">
      {location && <button className="mb-3 text-neutral-300" onClick={() => setLocation(null)}>← {en ? 'Locations' : '保存場所一覧'} / {location.name}</button>}
      <CardList notes={shown} selected={selected} language={language} onToggle={toggle} onDetail={openDetail} />
    </div>}
    <div className="mt-auto pt-4 flex items-center justify-between border-t border-neutral-700">
      <button onClick={onClose} className="px-4 py-2">{en ? 'Cancel' : 'キャンセル'}</button>
      <button disabled={!selected.size || restoring} onClick={restore} className="rounded-lg bg-sky-600 disabled:bg-neutral-700 px-5 py-2 font-semibold">{restoring ? (en ? 'Restoring…' : '取り出し中…') : en ? `Restore ${selected.size}` : `${selected.size}枚を取り出す`}</button>
    </div>
    {detail && <div className="absolute inset-8 z-10 rounded-xl bg-neutral-900 border border-neutral-600 p-5 overflow-auto"><button className="float-right" onClick={() => setDetail(null)}>✕</button><pre className="whitespace-pre-wrap font-sans mt-8">{detailBody || detail.preview}</pre></div>}
    {result && <div className="absolute bottom-20 left-5 right-5 rounded-lg bg-neutral-800 border border-neutral-600 p-3"><button className="float-right" onClick={() => setResult(null)}>✕</button><p>{en ? `${result.restored.length} restored` : `${result.restored.length}枚を取り出しました`}</p>{result.conflicts.map(item => <p key={item.sourcePath} className="text-amber-300">{en ? 'Not overwritten: ' : '上書きしませんでした: '}{item.sourcePath.split(/[\\/]/).pop()}</p>)}{result.failed.map(item => <p key={item.sourcePath} className="text-red-300">{item.error}</p>)}</div>}
  </div>;
}

function CardList({ notes, selected, language, onToggle, onDetail }: { notes: ArchivedNoteSummary[]; selected: Set<string>; language: Language; onToggle: (path: string) => void; onDetail: (note: ArchivedNoteSummary) => void | Promise<void> }) {
  const en = language === 'en';
  if (!notes.length) return <p className="text-neutral-400 py-4">{en ? 'No notes found.' : '該当する付箋はありません。'}</p>;
  return <div className="space-y-2">{notes.map(note => <div key={note.path} role="checkbox" aria-checked={selected.has(note.path)} tabIndex={0} onClick={() => onToggle(note.path)} onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); onToggle(note.path); } }} className={`rounded-xl border p-3 flex gap-3 cursor-pointer ${selected.has(note.path) ? 'border-sky-400 ring-1 ring-sky-400' : 'border-neutral-600'}`} style={{ backgroundColor: note.backgroundColor ? `color-mix(in srgb, ${note.backgroundColor} 28%, #171717)` : '#262626' }}>
    <input type="checkbox" checked={selected.has(note.path)} onChange={() => onToggle(note.path)} onClick={event => event.stopPropagation()} className="mt-1" />
    <div className="min-w-0 flex-1"><p className="whitespace-pre-line line-clamp-3">{note.preview}</p><div className="mt-2 text-xs text-neutral-300 flex gap-3"><span>🏷 {note.locationName}</span><span>{shownDate(note.archivedAt, language)}</span><button onClick={event => { event.stopPropagation(); onDetail(note); }} className="underline">{en ? 'Details' : '詳細'}</button></div></div>
    {note.previewImagePath && <img src={convertFileSrc(note.previewImagePath)} alt="" className="w-20 h-20 rounded object-cover" onError={event => { event.currentTarget.style.display = 'none'; }} />}
  </div>)}</div>;
}
