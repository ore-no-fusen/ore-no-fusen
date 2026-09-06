'use client';

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { safeUnlisten } from '../utils/safeUnlisten';

type MemberView = { generalNumber: number | null; analyticsSubject: string | null; consent: boolean | null; environment: string };
export default function MemberSettings({ language }: { language: string }) {
  const en = language === 'en';
  const [view,setView] = useState<MemberView | null>(null);
  const [error,setError] = useState(false);
  const [busy,setBusy] = useState(false);
  useEffect(() => {
    let stopped = false; let dispose: (() => void) | undefined;
    void invoke<MemberView>('member_get').then(v => { if (!stopped) setView(v); }).catch(() => { if (!stopped) setError(true); });
    void listen<MemberView>('member_updated', e => { if (!stopped) setView(e.payload); }).then(fn => { if (stopped) fn(); else dispose=fn; }).catch(() => { if (!stopped) setError(true); });
    return () => { stopped=true; safeUnlisten(dispose); };
  },[]);
  async function consent(granted: boolean) {
    setBusy(true); setError(false);
    try {
      setView(await invoke<MemberView>('member_set_consent',{ granted }));
    } catch { setError(true); } finally { setBusy(false); }
  }
  return <section className="mb-6 rounded-xl border border-slate-200 p-5">
    <h3 className="font-semibold">{en ? 'Member number' : '会員番号'}：{view?.generalNumber ?? (en ? 'Registration pending' : '登録待ち')}</h3>
    {view?.generalNumber && <button className="mt-2 text-sm underline" onClick={() => void navigator.clipboard.writeText(String(view.generalNumber)).catch(() => setError(true))}>{en ? 'Copy number' : '番号をコピー'}</button>}
    <p className="mt-4 text-sm leading-6">{en ? 'Allow weekly feature counts and active-day counts to be sent to Google Analytics with a random analysis ID linked to this member number? Usage history is not stored on the developer’s Vercel or Firestore. Note content, tag names, search terms and images are not sent.' : '機能ごとの週間使用回数と使用日数を、この会員番号と対応するランダムな分析IDでGoogle Analyticsへ送ってもよいですか？ 利用履歴は開発者のVercelやFirestoreには保存しません。付箋本文・タグ名・検索語・画像は送りません。'}</p>
    <p className="mt-2 text-sm">{en ? 'This works only when anonymous analytics is also enabled. All features remain available if you decline.' : '匿名利用状況の送信も有効な場合だけ計測されます。断っても全機能を使えます。'}</p>
    <p className="mt-2 text-sm">{en ? 'Current choice: ' : '現在の設定：'}{view?.consent === true ? (en ? 'Enabled' : '協力する') : view?.consent === false ? (en ? 'Disabled' : '送信しない') : (en ? 'Not selected' : '未選択')}</p>
    <div className="mt-3 flex gap-4">
      <button disabled={busy || !view} onClick={() => void consent(true)} className="rounded border px-3 py-2">{en ? 'Allow member usage analysis' : '会員別分析に協力する'}</button>
      <button disabled={busy || !view} onClick={() => void consent(false)} className="rounded border px-3 py-2">{en ? 'Do not send / stop' : '送信しない・停止する'}</button>
    </div>
    {error && <p role="status" className="mt-3 text-sm text-amber-800">{en ? 'Member data could not be read or synchronized. Please retry when online.' : '会員情報の読み込み、またはサーバーとの同期ができませんでした。通信可能な状態で再確認してください。'}</p>}
  </section>;
}
