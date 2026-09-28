import React from 'react';
import type { ReceivedIphoneNote } from '../utils/receiveIphoneNote';

export type IphoneOriginMatch = {
  path: string;
  body: string;
  bodyHash: string;
  changedSinceSend: boolean;
  backgroundColor?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

type Props = {
  note: ReceivedIphoneNote;
  origin: IphoneOriginMatch | null;
  busy: boolean;
  error: string | null;
  language: 'ja' | 'en';
  onDecide: (decision: 'apply' | 'new' | 'later') => void;
};

export default function IphoneReturnDialog({ note, origin, busy, error, language, onDecide }: Props) {
  const en = language === 'en';
  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900" role="dialog" aria-modal="true"
      aria-label={en ? 'Note returned from iPhone' : 'iPhoneから戻った付箋'}>
      <h1 className="text-xl font-bold">{en ? 'A note returned from your iPhone' : 'iPhoneから付箋が戻りました'}</h1>
      <p className="mt-2 text-sm text-slate-700">
        {origin
          ? origin.changedSinceSend
            ? (en ? 'The PC note also changed. Compare both versions before choosing.' : '送信後にPC側も変更されています。両方を確認して選んでください。')
            : (en ? 'The original PC note was found. Review the returned content.' : '元の付箋が見つかりました。反映する内容を確認してください。')
          : (en ? 'The original PC note was not found. Save a new note or decide later.' : '元の付箋が見つかりません。新しい付箋として保存するか、あとで確認できます。')}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <section className="rounded-lg border bg-white p-3">
          <h2 className="font-semibold">{en ? 'Current PC content' : 'PCの現在の内容'}</h2>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm">{origin?.body ?? (en ? 'Original note not found' : '元の付箋が見つかりません')}</pre>
        </section>
        <section className="rounded-lg border bg-white p-3">
          <h2 className="font-semibold">{en ? 'Returned iPhone content' : 'iPhoneから戻った内容'}</h2>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm">{note.body}</pre>
        </section>
      </div>
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" disabled={!origin || busy} onClick={() => onDecide('apply')}
          className="rounded bg-blue-700 px-4 py-2 font-medium text-white disabled:opacity-40">{en ? 'Apply to original' : '元の付箋に反映'}</button>
        <button type="button" disabled={busy} onClick={() => onDecide('new')}
          className="rounded border border-slate-400 bg-white px-4 py-2 font-medium">{en ? 'Open as new note' : '新しい付箋として開く'}</button>
        <button type="button" disabled={busy} onClick={() => onDecide('later')}
          className="rounded px-4 py-2 font-medium">{en ? 'Decide later' : 'あとで決める'}</button>
      </div>
      <p className="mt-3 text-xs text-slate-600">{en
        ? 'The PC note is backed up before applying. Decide later will show this again on the next app launch.'
        : '反映前のPCの内容はバックアップに保存します。「あとで決める」は次回起動時に再表示します。'}</p>
    </main>
  );
}
