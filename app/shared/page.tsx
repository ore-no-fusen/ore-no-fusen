'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import React from 'react';
import { refreshAccessToken } from '@/app/viewer/lib/drive';
import { renderSecureMermaid } from '@/app/utils/mermaid';
import { copySharedConnectionDiagnostics, logSharedConnection } from './lib/connection-diagnostic';
import { markSharedLoginReturn } from './lib/login-return';
import { appendWebEdit, downloadSharedImage, loadSharedNotes, pendingCreatedNote, setWebSharing, type SharedNote } from './lib/drive';
import { NewNote } from './NewNote';
import ConfirmDialog from '@/app/components/ConfirmDialog';

type DriveFile = { id: string; name: string; mimeType?: string };

function MermaidDiagram({ code }: { code: string }) {
  const id = useId().replace(/:/g, '');
  const [svg, setSvg] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setSvg('');
    setFailed(false);
    void renderSecureMermaid(`shared-mermaid-${id}`, code)
      .then((rendered) => { if (!cancelled) setSvg(rendered); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [code, id]);

  if (failed) return <div role="status" style={{ margin: '10px 0' }}><p>図を表示できません。図のコードを表示します。</p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', overflowX: 'auto' }}><code>{code}</code></pre></div>;
  if (!svg) return <p role="status" style={{ color: '#607086' }}>図を作成しています…</p>;
  return <div role="img" aria-label="Mermaid図" style={{ maxWidth: '100%', overflowX: 'auto', overflowY: 'hidden', margin: '12px 0' }}><div dangerouslySetInnerHTML={{ __html: svg }} /></div>;
}

function setTaskLine(markdown: string, lineIndex: number, checked: boolean): string {
  return markdown.split('\n').map((line, index) => index === lineIndex
    ? line.replace(/^(\s*[-*+]\s*\[)[ xX](\]\s*)/, `$1${checked ? 'x' : ' '}$2`)
    : line).join('\n');
}

function safeWebHref(destination: string): string | null {
  const trimmed = destination.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch { return null; }
}

function renderInlineContent(text: string, images: Record<string, string>, imageDisplay: 'block' | 'inline' = 'inline'): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /(`+)(.*?)\1|!\[([^\]]*)\]\(ore-fusen-image:\/\/(img-[0-9a-f]{64})\)|\[([^\]]+)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)|(?<!\\)\*\*([^*\n]+)\*\*/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > cursor) parts.push(text.slice(cursor, match.index));
    if (match[1]) parts.push(match[0]);
    else if (match[3] !== undefined) {
      const source = images[match[4]];
      parts.push(source === 'ERROR'
        ? <span key={`error-${match.index}`} role="status" style={{ display: imageDisplay, color: '#a11' }}>画像を確認できませんでした。安全のため表示を止めています。</span>
        : source
          ? <img key={`image-${match.index}`} src={source} alt={match[3] || '付箋の画像'} style={{ display: imageDisplay, verticalAlign: 'middle', maxWidth: '100%', height: 'auto', borderRadius: 8, margin: '10px 0' }} />
          : <span key={`loading-${match.index}`} role="status" style={{ display: imageDisplay, color: '#6b7280' }}>画像を読み込み中…</span>);
    } else if (match[5] !== undefined) {
      const href = safeWebHref(match[6]);
      parts.push(href
        ? <a key={`link-${match.index}`} href={href} target="_blank" rel="noopener noreferrer" title={match[7]}>{match[5]}</a>
        : match[5]);
    } else parts.push(<strong key={`strong-${match.index}`} style={{ color: 'red', fontWeight: 'bold' }}>{match[8]}</strong>);
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

type LineRange = { start: number; end: number; closed: boolean };

function fencedCodeRanges(lines: string[]): Map<number, LineRange> {
  const ranges = new Map<number, LineRange>();
  let fence: { marker: '`' | '~'; length: number } | null = null;
  let start = -1;
  lines.forEach((line, index) => {
    if (fence) {
      const close = line.match(/^ {0,3}(`+|~+)\s*$/);
      if (close && close[1][0] === fence.marker && close[1].length >= fence.length) {
        for (let lineIndex = start; lineIndex <= index; lineIndex += 1) ranges.set(lineIndex, { start, end: index, closed: true });
        fence = null;
        start = -1;
      }
      return;
    }
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (opening) {
      fence = { marker: opening[1][0] as '`' | '~', length: opening[1].length };
      start = index;
    }
  });
  if (fence && start >= 0) {
    for (let lineIndex = start; lineIndex < lines.length; lineIndex += 1) ranges.set(lineIndex, { start, end: lines.length - 1, closed: false });
  }
  return ranges;
}

export default function SharedNotesPage() {
  const [token, setToken] = useState('');
  const [notes, setNotes] = useState<SharedNote[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [selected, setSelected] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [images, setImages] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const checkSaving = useRef(false);
  const [pendingTask, setPendingTask] = useState<{ operationId: string; lineIndex: number; checked: boolean } | null>(null);
  const [message, setMessage] = useState('Google Driveに接続して付箋を読み込みます。');
  const [diagnosticMessage, setDiagnosticMessage] = useState('');
  const [creating,setCreating]=useState(false);
  const [showStopped, setShowStopped] = useState(false);
  const [sharingConfirmation, setSharingConfirmation] = useState<{ note: SharedNote; paused: boolean } | null>(null);

  useEffect(() => {
    logSharedConnection('shared_page_loaded');
    const onPageShow = () => logSharedConnection('shared_page_shown');
    const onError = (event: Event) => logSharedConnection('browser_error', {
      category: event instanceof ErrorEvent ? 'script_error' : 'resource_error',
    });
    const onRejection = () => logSharedConnection('promise_rejection');
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('error', onError, true);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('error', onError, true);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  async function copyDiagnostics() {
    try {
      await navigator.clipboard.writeText(copySharedConnectionDiagnostics());
      setDiagnosticMessage('診断情報をコピーしました。');
    } catch { setDiagnosticMessage('コピーできませんでした。'); }
  }

  const reload = useCallback(async (accessToken: string) => {
    setBusy(true);
    try {
      const loaded = await loadSharedNotes(accessToken);
      const allNotes = [...loaded.notes, ...(loaded.stoppedNotes ?? [])];
      setNotes(allNotes);
      setFiles(loaded.files);
      setSelected((index) => Math.min(index, Math.max(0, allNotes.length - 1)));
      setMessage(loaded.notes.length ? `${loaded.notes.length}件の付箋を読み込みました。` : 'まだ付箋がありません。先にWindowsのランチャーから同期してください。');
      setEditing(false);
      return loaded;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Driveから読み込めませんでした。');
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function connect() {
      let current = localStorage.getItem('viewer_access_token') ?? '';
      const expiry = Number(localStorage.getItem('viewer_expires_at') ?? 0);
      if (!current || (expiry && expiry < Date.now() + 30_000)) current = await refreshAccessToken() ?? '';
      if (cancelled) return;
      if (!current) {
        setMessage('Google接続が必要です。接続後、この画面をもう一度開いてください。');
        return;
      }
      setToken(current);
      await reload(current);
    }
    void connect();
    return () => { cancelled = true; };
  }, [reload]);

  const normalizedSearch = search.trim().toLowerCase();
  const allTags = useMemo(() => {
    const unique = new Map<string, string>();
    notes.flatMap(({ operation }) => operation.payload.tags ?? []).forEach((tag) => {
      const key = tag.toLowerCase();
      if (!unique.has(key)) unique.set(key, tag);
    });
    return [...unique.values()].sort((left, right) => left.localeCompare(right, 'ja'));
  }, [notes]);
  const visibleNotes = useMemo(() => notes
    .map((note, index) => ({ note, index }))
    .filter(({ note }) => Boolean(note.paused) === showStopped && (!normalizedSearch ||
      `${note.operation.payload.title}\n${note.operation.payload.markdown}`.toLowerCase().includes(normalizedSearch)) &&
      (!selectedTag || (note.operation.payload.tags ?? []).some((tag) => tag.toLowerCase() === selectedTag.toLowerCase()))), [notes, normalizedSearch, selectedTag, showStopped]);
  const current = visibleNotes.find(({ index }) => index === selected)?.note;
  useEffect(() => {
    if (visibleNotes.length && !visibleNotes.some(({ index }) => index === selected)) {
      setSelected(visibleNotes[0].index);
    }
  }, [visibleNotes, selected]);
  useEffect(() => {
    if (selectedTag && !allTags.some((tag) => tag.toLowerCase() === selectedTag.toLowerCase())) {
      setSelectedTag('');
    }
  }, [allTags, selectedTag]);
  const dirty = Boolean(current && editing && (
    title !== current.operation.payload.title || markdown !== current.operation.payload.markdown
  ));
  useEffect(() => {
    if (!current) return;
    setTitle(current.operation.payload.title);
    setMarkdown(current.operation.payload.markdown);
  }, [current?.operation.operationId]);

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];
    async function loadImages() {
      if (!token || !current) { setImages({}); return; }
      const entries = await Promise.all(current.operation.payload.images.map(async (image) => {
        try {
          const url = await downloadSharedImage(token, files, image);
          objectUrls.push(url);
          return [image.imageId, url] as const;
        } catch { return [image.imageId, 'ERROR'] as const; }
      }));
      if (!cancelled) setImages(Object.fromEntries(entries));
    }
    void loadImages();
    return () => { cancelled = true; objectUrls.forEach(URL.revokeObjectURL); };
  }, [token, current?.operation.operationId, files]);

  async function save() {
    if (!current || !token) return;
    setBusy(true);
    setMessage('変更をDriveに保存しています…');
    try {
      await appendWebEdit(token, current, { ...current.operation.payload, title, markdown });
      if (!await reload(token)) throw new Error('保存後の再取得に失敗しました。Webを更新して保存結果を確認してください。');
      setMessage('保存しました。Windowsに反映するには、PC側で「Webと同期」を押してください。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存できませんでした。');
    } finally { setBusy(false); }
  }

  async function toggleViewedTask(lineIndex: number, checked: boolean) {
    if (!current || current.paused || current.pendingCreate || !token || busy || checkSaving.current) return;
    if (editing) { setMarkdown(value => setTaskLine(value, lineIndex, checked)); return; }
    checkSaving.current = true;
    setPendingTask({ operationId: current.operation.operationId, lineIndex, checked });
    setBusy(true);
    setMessage('チェックの変更を保存しています…');
    try {
      await appendWebEdit(token, current, {
        ...current.operation.payload,
        markdown: setTaskLine(current.operation.payload.markdown, lineIndex, checked),
      });
      // Read the new operation/head before another click; an old head must not
      // be reused for the next change. Do not optimistically show unsaved data.
      const loaded = await loadSharedNotes(token);
      setNotes([...loaded.notes, ...(loaded.stoppedNotes ?? [])]);
      setFiles(loaded.files);
      setMessage('チェックを保存しました。Windowsには「Webと同期」で反映します。');
    } catch (error) {
      setMessage(`${error instanceof Error ? error.message : '保存結果を確認できませんでした。'} Webを更新して保存結果を確認してください。`);
    } finally {
      checkSaving.current = false;
      setPendingTask(null);
      setBusy(false);
    }
  }

  const button: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 14px', background: 'white', color: '#162238', fontWeight: 600, cursor: 'pointer' };
  const taskPattern = /^(\s*[-*+]\s*)\[([ xX])\](\s*)(.*)$/;
  const bodyLines = markdown.split('\n');
  const fencedCodeRangesByLine = fencedCodeRanges(bodyLines);
  const mermaidCount = [...new Set([...fencedCodeRangesByLine.values()].map((range) => range.start))]
    .filter((start) => /^```\s*mermaid\s*$/i.test(bodyLines[start].trim())).length;
  // The Windows note title may also be copied into the first body line. Show
  // that heading only once in both modes, while keeping the original Markdown
  // intact in editor state and when saving back to Windows.
  const firstBodyLine = bodyLines.findIndex((line) => line.trim().length > 0);
  const detectedDuplicateTitleLine = firstBodyLine >= 0 && bodyLines[firstBodyLine].trim() === title.trim()
    ? firstBodyLine
    : -1;
  const duplicateTitleLine = detectedDuplicateTitleLine;

  return <main style={{ minHeight: '100vh', background: '#f2f5f9', padding: '24px 16px', color: '#17243a', fontFamily: 'system-ui, sans-serif' }}>
    <div style={{ maxWidth: 1000, margin: '0 auto', background: 'white', borderRadius: 18, padding: '24px 28px', boxShadow: '0 8px 30px #17243a12' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #e2e8f0', paddingBottom: 16 }}>
        <div><div style={{ fontSize: 13, color: '#55708f' }}>Windowsランチャーの付箋をどの端末からも</div><h1 style={{ margin: '4px 0 0', fontSize: 27 }}>俺の付箋 · Web</h1></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {token && <button style={button} disabled={busy||editing} onClick={()=>setCreating(true)}>＋新規</button>}
          {!token && <a href="/viewer?shared=1" onClick={() => {
            markSharedLoginReturn();
            logSharedConnection('shared_connect_clicked', { targetPath: '/viewer', sharedMode: true });
          }} style={{ ...button, textDecoration: 'none' }}>Google接続</a>}
          <button style={button} disabled={!token || busy} onClick={() => {
            if (dirty && !window.confirm('保存していない変更があります。破棄してWebを更新しますか？')) return;
            void reload(token);
          }}>Webを更新</button>
        </div>
      </header>
      <p role="status" style={{ color: '#52627a', minHeight: 24 }}>{message}</p>
      {creating&&token&&<NewNote token={token} onDone={(text,request)=>{
        setCreating(false);setMessage(text);
        if(request){
          setNotes(previous=>[pendingCreatedNote(request),...previous.filter(note=>note.scope.noteId!==request.noteId)]);
          setSelected(0);setSearch('');setSelectedTag('');setShowStopped(false);setEditing(false);
        }
      }}/>}
      {process.env.NODE_ENV === 'development' && <div style={{ margin: '8px 0 14px', fontSize: 13, color: '#52627a' }}>
        <button type="button" style={button} onClick={() => void copyDiagnostics()}>接続診断をコピー</button>
        <span role="status" aria-live="polite" style={{ marginLeft: 8 }}>{diagnosticMessage}</span>
        <div>接続操作・画面起動・Service Worker状態だけ記録します。付箋本文と認証情報は記録しません。画面読込前の失敗原因そのものは記録できません。</div>
      </div>}
      {notes.length > 0 && <div>
        <section aria-label="付箋を探す">
          <div role="group" aria-label="タグで絞り込み" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 0 12px' }}>
            <button type="button" aria-pressed={!selectedTag} disabled={editing || busy} onClick={() => setSelectedTag('')} style={{ ...button, flex: '0 0 auto', borderRadius: 999, background: !selectedTag ? '#1689dc' : '#f8fafc', color: !selectedTag ? 'white' : '#162238' }}>すべて</button>
            {allTags.map((tag) => {
              const active = selectedTag.toLowerCase() === tag.toLowerCase();
              return <button key={tag} type="button" aria-pressed={active} disabled={editing || busy} onClick={() => setSelectedTag(tag)} style={{ ...button, flex: '0 0 auto', borderRadius: 999, background: active ? '#1689dc' : '#f8fafc', color: active ? 'white' : '#162238' }}>{tag}</button>;
            })}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'end', marginBottom: 14, flexWrap: 'wrap' }}>
            <label htmlFor="shared-note-search" style={{ display: 'block', flex: '1 1 320px', fontWeight: 600 }}>付箋を検索
              <input id="shared-note-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="題名や本文で検索" disabled={editing || busy} style={{ ...button, display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'left', fontWeight: 400, marginTop: 6 }} />
            </label>
            <span aria-live="polite" style={{ color: '#52627a', fontSize: 14, paddingBottom: 10 }}>{showStopped ? '共有停止中 ' : ''}{visibleNotes.length} / {notes.filter(note => Boolean(note.paused) === showStopped).length} 件</span>
          </div>
        </section>
        <div className="shared-grid">
          <nav aria-label="付箋一覧" style={{ display: 'grid', alignContent: 'start', gap: 8 }}>
          {visibleNotes.map(({ note, index }) => <button key={`${note.scope.noteId}:${note.operation.operationId}`} disabled={busy} onClick={() => {
            if (index === selected) return;
            if (dirty && !window.confirm('保存していない変更があります。破棄して別の付箋を開きますか？')) return;
            setEditing(false);
            setSelected(index);
          }} style={{ ...button, textAlign: 'left', background: index === selected ? '#e7f2fc' : 'white', borderColor: index === selected ? '#298bd1' : '#cbd5e1', boxShadow: `inset 5px 0 0 ${note.operation.payload.backgroundColor ?? '#f7e9b0'}`, opacity: busy ? 0.65 : 1 }}>
            📌 {note.operation.payload.title}<small style={{ display: 'block', marginTop: 3, color: '#5d7086' }}>{note.pendingCreate ? 'Windows同期待ち' : 'Windowsランチャー登録'}</small>
          </button>)}
          {visibleNotes.length === 0 && <p role="status" style={{ color: '#607086' }}>一致する付箋がありません。</p>}
          </nav>
        {current && <section style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <strong>付箋の内容</strong>
            {!editing ? !current.paused && !current.pendingCreate && <button style={button} disabled={busy} onClick={() => {
              setEditing(true);
            }}>編集</button> : <div style={{ display: 'flex', gap: 8 }}>
              <button style={button} disabled={busy} onClick={() => {
                if (dirty && !window.confirm('編集内容を破棄しますか？')) return;
                setTitle(current.operation.payload.title); setMarkdown(current.operation.payload.markdown); setEditing(false);
              }}>キャンセル</button>
              <button style={{ ...button, background: '#1689dc', color: 'white', borderColor: '#1689dc' }} disabled={busy} onClick={() => void save()}>保存</button>
            </div>}
          </div>
          <article aria-busy={Boolean(pendingTask)} style={{ background: current.operation.payload.backgroundColor ?? '#f7e9b0', borderRadius: 12, padding: '22px 26px', minHeight: 260, overflowWrap: 'anywhere' }}>
            {!editing && <h2 style={{ marginTop: 0 }}>{current.operation.payload.title}</h2>}
            <div>
              {editing ? <textarea aria-label="付箋本文" disabled={busy} rows={16} value={markdown} onChange={event => setMarkdown(event.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: 0, padding: 0, background: 'transparent', color: 'inherit', font: 'inherit', lineHeight: 1.6, resize: 'vertical' }} /> : bodyLines.map((line, index) => {
                if (index === duplicateTitleLine) return null;
                const codeRange = fencedCodeRangesByLine.get(index);
                if (codeRange) {
                  if (index !== codeRange.start) return null;
                  const codeEnd = codeRange.closed ? codeRange.end : codeRange.end + 1;
                  if (/^```\s*mermaid\s*$/i.test(bodyLines[codeRange.start].trim()) && codeRange.closed && mermaidCount <= 10) {
                    return <MermaidDiagram key={`mermaid-${codeRange.start}`} code={bodyLines.slice(codeRange.start + 1, codeEnd).join('\n')} />;
                  }
                  return <pre key={`code-${codeRange.start}`} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', overflowX: 'auto', margin: '8px 0', padding: 10, borderRadius: 6, background: '#f4f1e8' }}><code>{bodyLines.slice(codeRange.start + 1, codeEnd).join('\n')}</code></pre>;
                }
                const task = line.match(taskPattern);
                if (task) {
                  const checked = pendingTask?.operationId === current.operation.operationId && pendingTask.lineIndex === index ? pendingTask.checked : task[2].toLowerCase() === 'x';
                  return <div key={index} style={{ display: 'flex', gap: 6, alignItems: 'baseline', padding: '7px 0' }}>
                    <button type="button" role="checkbox" aria-label={task[4]} aria-checked={checked} title={checked ? '未完了にする' : '完了にする'} disabled={busy || current.paused || current.pendingCreate} onClick={() => void toggleViewedTask(index, !checked)} style={{ border: 0, padding: 0, background: 'transparent', color: checked ? '#4caf50' : '#888', width: '1em', flex: '0 0 1em', textAlign: 'center', font: 'inherit', lineHeight: 'inherit', cursor: !busy && !current.paused ? 'pointer' : 'default' }}>{checked ? '☑' : '☐'}</button>
                    <span style={{ textDecoration: checked ? 'line-through' : 'none', opacity: checked ? 0.6 : 1 }}>{renderInlineContent(task[4], images)}</span>
                  </div>;
                }
                const imageMatches = [...line.matchAll(/!\[([^\]]*)\]\(ore-fusen-image:\/\/(img-[0-9a-f]{64})\)/g)];
                const heading = !editing ? line.match(/^(#{1,6})\s+(.*)$/) : null;
                if (heading) {
                  const level = heading[1].length;
                  const sizes = ['1.1em', '1.05em', '1em', '0.95em', '0.9em', '0.85em'];
                  return <div key={index} role="heading" aria-level={level} style={{ minHeight: line ? undefined : 8, whiteSpace: 'pre-wrap', margin: '9px 0 5px', fontSize: sizes[level - 1], fontWeight: 700 }}>{renderInlineContent(heading[2], images, imageMatches.length ? 'block' : 'inline')}</div>;
                }
                const unordered = !editing ? line.match(/^\s*[-*+]\s+(.*)$/) : null;
                const ordered = !editing ? line.match(/^(\s*\d+[.)])\s+(.*)$/) : null;
                if (unordered || ordered) {
                  const listKind = unordered ? 'unordered' : 'ordered';
                  const previous = index > 0 ? bodyLines[index - 1] : '';
                  const previousIsSameList = !taskPattern.test(previous) && (listKind === 'unordered'
                    ? /^\s*[-*+]\s+/.test(previous)
                    : /^\s*\d+[.)]\s+/.test(previous));
                  if (previousIsSameList) return null;
                  const items: React.ReactNode[] = [];
                  for (let itemIndex = index; itemIndex < bodyLines.length; itemIndex += 1) {
                    const itemLine = bodyLines[itemIndex];
                    if (taskPattern.test(itemLine)) break;
                    const match = listKind === 'unordered' ? itemLine.match(/^\s*[-*+]\s+(.*)$/) : itemLine.match(/^(\s*\d+[.)])\s+(.*)$/);
                    if (!match) break;
                    const itemBody = listKind === 'unordered' ? match[1] : match[2];
                    items.push(<div role="listitem" key={itemIndex} style={{ display: 'flex', gap: 8, whiteSpace: 'pre-wrap', margin: '5px 0' }}><span aria-hidden={listKind === 'unordered' ? 'true' : undefined}>{listKind === 'unordered' ? '•' : match[1]}</span><span>{renderInlineContent(itemBody, images, /!\[[^\]]*\]\(ore-fusen-image:\/\//.test(itemBody) ? 'block' : 'inline')}</span></div>);
                  }
                  return <div key={index} role="list">{items}</div>;
                }
                if (imageMatches.length) return <div key={index} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '7px 0' }}>{renderInlineContent(line, images, 'block')}</div>;
                return <p key={index} style={{ minHeight: line ? undefined : 8, whiteSpace: 'pre-wrap', margin: '7px 0' }}>{renderInlineContent(line.replace(/^\s*[-*+]\s+/, '・'), images)}</p>;
              })}
            </div>
          </article>
          <p style={{ color: '#607086', fontSize: 13 }}>{current.pendingCreate ? 'Windows同期待ちです。PC側で「Webと同期」を押すと、Windowsに取り込みます。取込後に編集できます。' : current.paused ? 'Web共有を停止しています。ここには最後に共有した内容を表示しています。Windowsの付箋とランチャー登録は残ります。' : 'チェックは押すと保存します。本文は「編集」で変更できます。Windows側は「Webと同期」で反映します。'}</p>
        </section>}
        </div>
      </div>}
      {token && <details style={{ marginTop: 24, borderTop: '1px solid #e2e8f0', paddingTop: 12, color: '#607086', fontSize: 13 }}>
        <summary style={{ cursor: 'pointer', textAlign: 'right' }}>詳細操作</summary>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
          <button style={button} disabled={busy || editing} onClick={() => { setShowStopped(!showStopped); setSearch(''); setSelectedTag(''); }}>{showStopped ? '共有中の一覧へ戻る' : `共有停止中の付箋（${notes.filter(note => note.paused).length}）`}</button>
          {current && !current.pendingCreate && !editing && <button style={button} disabled={busy} onClick={() => setSharingConfirmation({ note: current, paused: !current.paused })}>{current.paused ? 'Web共有を再開' : 'Web共有を停止'}</button>}
        </div>
      </details>}
      <footer style={{ marginTop: 16, borderTop: '1px solid #e2e8f0', paddingTop: 14, color: '#6b7b8f', fontSize: 13 }}>Google Driveは共有用の一時置き場です。Windowsの付箋が原本です。同期はボタンを押した時だけ行います。</footer>
    </div>
    {sharingConfirmation && <ConfirmDialog isOpen title={sharingConfirmation.paused ? 'Web共有を停止' : 'Web共有を再開'}
      message={`「${sharingConfirmation.note.operation.payload.title}」のWeb共有を${sharingConfirmation.paused ? '停止' : '再開'}します。Windowsの付箋とランチャー登録は変わりません。${sharingConfirmation.paused ? '通常の同期では再開しません。' : '最新のWindows内容は次の「Webと同期」で反映します。'}`}
      confirmText={sharingConfirmation.paused ? '停止する' : '再開する'} cancelText="戻る"
      onCancel={() => setSharingConfirmation(null)} onConfirm={() => {
        const target = sharingConfirmation;
        setSharingConfirmation(null); setBusy(true);
        void (async () => {
          try {
            await setWebSharing(token, target.note, target.paused);
            const loaded = await reload(token);
            if (!loaded) { setMessage('共有設定の保存後に再取得できませんでした。Webを更新して結果を確認してください。'); return; }
            const actual = [...loaded.notes, ...(loaded.stoppedNotes ?? [])].find(note => note.scope.noteId === target.note.scope.noteId && note.scope.generation === target.note.scope.generation && note.scope.accountSubject === target.note.scope.accountSubject);
            if (!actual) { setMessage('共有設定の結果を確認できませんでした。Webを更新してください。'); return; }
            if (Boolean(actual.paused) !== target.paused) { setMessage(actual.paused ? '別の端末の停止操作があるため、Web共有は停止中です。状態を確認して再開してください。' : '別の端末でWeb共有が再開されています。最新の一覧を表示しました。'); return; }
            setMessage(target.paused ? 'Web共有を停止しました。Windowsのランチャー登録はそのままです。' : 'Web共有を再開しました。最新のWindows内容は「Webと同期」で反映します。');
          }
          catch (error) { setMessage(`${error instanceof Error ? error.message : '共有設定の保存結果を確認できませんでした。'} Webを更新して状態を確認してください。`); }
          finally { setBusy(false); }
        })();
      }} />}
    <style jsx>{`.shared-grid{display:grid;grid-template-columns:minmax(190px,.8fr) minmax(0,2fr);gap:20px}@media(max-width:680px){.shared-grid{grid-template-columns:minmax(0,1fr)}}`}</style>
  </main>;
}
