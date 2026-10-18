'use client';

import { useCallback, useEffect, useState } from 'react';
import { refreshAccessToken } from '@/app/viewer/lib/drive';
import { appendWebEdit, downloadSharedImage, loadSharedNotes, type SharedNote } from './lib/drive';

type DriveFile = { id: string; name: string; mimeType?: string };

function setTaskLine(markdown: string, lineIndex: number, checked: boolean): string {
  return markdown.split('\n').map((line, index) => index === lineIndex
    ? line.replace(/^(\s*[-*+]\s*\[)[ xX](\]\s*)/, `$1${checked ? 'x' : ' '}$2`)
    : line).join('\n');
}

export default function SharedNotesPage() {
  const [token, setToken] = useState('');
  const [notes, setNotes] = useState<SharedNote[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [selected, setSelected] = useState(0);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [images, setImages] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Google Driveに接続して付箋を読み込みます。');

  const reload = useCallback(async (accessToken: string) => {
    setBusy(true);
    try {
      const loaded = await loadSharedNotes(accessToken);
      setNotes(loaded.notes);
      setFiles(loaded.files);
      setSelected((index) => Math.min(index, Math.max(0, loaded.notes.length - 1)));
      setMessage(loaded.notes.length ? `${loaded.notes.length}件の付箋を読み込みました。` : 'まだ付箋がありません。先にWindowsのランチャーから同期してください。');
      setEditing(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Driveから読み込めませんでした。');
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

  const current = notes[selected];
  const dirty = Boolean(current && editing && (
    title !== current.operation.payload.title || markdown !== current.operation.payload.markdown
  ));
  useEffect(() => {
    if (!current) return;
    setTitle(current.operation.payload.title);
    setMarkdown(current.operation.payload.markdown);
    setEditing(false);
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
      await appendWebEdit(token, current, { title, markdown, images: current.operation.payload.images });
      await reload(token);
      setMessage('保存しました。Windowsに反映するには、PC側で「Webと同期」を押してください。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存できませんでした。');
    } finally { setBusy(false); }
  }

  const button: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 14px', background: 'white', color: '#162238', fontWeight: 600, cursor: 'pointer' };
  const taskPattern = /^(\s*[-*+]\s*)\[([ xX])\](\s*)(.*)$/;

  return <main style={{ minHeight: '100vh', background: '#f2f5f9', padding: '24px 16px', color: '#17243a', fontFamily: 'system-ui, sans-serif' }}>
    <div style={{ maxWidth: 1000, margin: '0 auto', background: 'white', borderRadius: 18, padding: '24px 28px', boxShadow: '0 8px 30px #17243a12' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #e2e8f0', paddingBottom: 16 }}>
        <div><div style={{ fontSize: 13, color: '#55708f' }}>Windowsランチャーの付箋をどの端末からも</div><h1 style={{ margin: '4px 0 0', fontSize: 27 }}>俺の付箋 · Web</h1></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!token && <a href="/viewer" onClick={() => localStorage.setItem('viewer_return_to', '/shared')} style={{ ...button, textDecoration: 'none' }}>Google接続</a>}
          <button style={button} disabled={!token || busy} onClick={() => {
            if (dirty && !window.confirm('保存していない変更があります。破棄してWebを更新しますか？')) return;
            void reload(token);
          }}>Webを更新</button>
        </div>
      </header>
      <p role="status" style={{ color: '#52627a', minHeight: 24 }}>{message}</p>
      {notes.length > 0 && <div className="shared-grid">
        <nav aria-label="付箋一覧" style={{ display: 'grid', alignContent: 'start', gap: 8 }}>
          {notes.map((note, index) => <button key={`${note.scope.noteId}:${note.operation.operationId}`} disabled={busy} onClick={() => {
            if (index === selected) return;
            if (dirty && !window.confirm('保存していない変更があります。破棄して別の付箋を開きますか？')) return;
            setSelected(index);
          }} style={{ ...button, textAlign: 'left', background: index === selected ? '#e7f2fc' : 'white', borderColor: index === selected ? '#298bd1' : '#cbd5e1', opacity: busy ? 0.65 : 1 }}>
            📌 {note.operation.payload.title}<small style={{ display: 'block', marginTop: 3, color: '#5d7086' }}>Windowsランチャー登録</small>
          </button>)}
        </nav>
        {current && <section style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <strong>付箋の内容</strong>
            {!editing ? <button style={button} onClick={() => setEditing(true)}>編集</button> : <div style={{ display: 'flex', gap: 8 }}>
              <button style={button} disabled={busy} onClick={() => {
                if (dirty && !window.confirm('編集内容を破棄しますか？')) return;
                setTitle(current.operation.payload.title); setMarkdown(current.operation.payload.markdown); setEditing(false);
              }}>キャンセル</button>
              <button style={{ ...button, background: '#1689dc', color: 'white', borderColor: '#1689dc' }} disabled={busy} onClick={() => void save()}>保存</button>
            </div>}
          </div>
          <article style={{ background: '#fff2b8', borderRadius: 12, padding: '22px 26px', minHeight: 260, overflowWrap: 'anywhere' }}>
            <h2 style={{ marginTop: 0 }}>{current.operation.payload.title}</h2>
            <div>
              {markdown.split('\n').map((line, index) => {
                const task = line.match(taskPattern);
                if (task) return <label key={index} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0', cursor: editing ? 'pointer' : 'default' }}><input type="checkbox" checked={task[2].toLowerCase() === 'x'} disabled={!editing || busy} onChange={(event) => setMarkdown((value) => setTaskLine(value, index, event.target.checked))} />{editing ? <input aria-label={`項目 ${index + 1}`} disabled={busy} value={task[4]} onChange={(event) => setMarkdown((value) => value.split('\n').map((row, rowIndex) => rowIndex === index ? row.replace(/^(\s*[-*+]\s*\[[ xX]\]\s*).*/, `$1${event.target.value}`) : row).join('\n'))} style={{ flex: 1, border: '1px solid #d6bd66', borderRadius: 5, padding: 6, background: '#fff9df', font: 'inherit' }} /> : task[4]}</label>;
                const image = line.match(/!\[[^\]]*\]\(ore-fusen-image:\/\/(img-[0-9a-f]{64})\)/);
                if (image) return images[image[1]] === 'ERROR' ? <p key={index} style={{ color: '#a11' }}>画像を確認できませんでした。安全のため表示を止めています。</p> : images[image[1]] ? <img key={index} src={images[image[1]]} alt="付箋の画像" style={{ maxWidth: '100%', height: 'auto', borderRadius: 8, margin: '10px 0' }} /> : <p key={index} style={{ color: '#6b7280' }}>画像を読み込み中…</p>;
                if (editing) return <input key={index} aria-label={`本文 ${index + 1}`} disabled={busy} value={line} onChange={(event) => setMarkdown((value) => value.split('\n').map((row, rowIndex) => rowIndex === index ? event.target.value : row).join('\n'))} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d6bd66', borderRadius: 5, padding: 6, margin: '3px 0', background: '#fff9df', font: 'inherit' }} />;
                return <p key={index} style={{ minHeight: line ? undefined : 8, whiteSpace: 'pre-wrap', margin: '7px 0' }}>{line.replace(/^\s*[-*+]\s+/, '・')}</p>;
              })}
              {editing && <button type="button" disabled={busy} style={{ ...button, marginTop: 8 }} onClick={() => setMarkdown((value) => `${value}${value.endsWith('\n') || !value ? '' : '\n'}新しい項目`)}>＋ 行を追加</button>}
            </div>
          </article>
          <p style={{ color: '#607086', fontSize: 13 }}>チェックを変えるには「編集」を押します。保存後、Windows側は手動同期で反映します。</p>
        </section>}
      </div>}
      <footer style={{ marginTop: 24, borderTop: '1px solid #e2e8f0', paddingTop: 14, color: '#6b7b8f', fontSize: 13 }}>Google Driveは共有用の一時置き場です。Windowsの付箋が原本です。同期はボタンを押した時だけ行います。</footer>
    </div>
    <style jsx>{`.shared-grid{display:grid;grid-template-columns:minmax(190px,.8fr) minmax(0,2fr);gap:20px}@media(max-width:680px){.shared-grid{grid-template-columns:minmax(0,1fr)}}`}</style>
  </main>;
}
