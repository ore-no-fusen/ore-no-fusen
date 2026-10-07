'use client';

import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { safeUnlisten } from '../utils/safeUnlisten';

type MemberView = { generalNumber: number | null; analyticsSubject: string | null; environment: string };
type UsageSettings = { analytics_consent?: 'granted' | 'denied'; [key: string]: unknown };
export default function MemberSettings({ language }: { language: string }) {
  const en = language === 'en';
  const [view,setView] = useState<MemberView | null>(null);
  const [choice,setChoice] = useState<UsageSettings['analytics_consent']>();
  const [error,setError] = useState(false);
  const [busy,setBusy] = useState(false);
  useEffect(() => {
    let stopped = false; let dispose: (() => void) | undefined; let disposeSettings: (() => void) | undefined;
    void invoke<MemberView>('member_get').then(async v => {
      const settings=await invoke<UsageSettings>('get_settings');
      if (!stopped) { setView(v); setChoice(settings.analytics_consent); }
    }).catch(() => { if (!stopped) setError(true); });
    void listen<MemberView>('member_updated', e => { if (!stopped) setView(e.payload); }).then(fn => { if (stopped) fn(); else dispose=fn; }).catch(() => { if (!stopped) setError(true); });
    void listen<UsageSettings>('settings_updated', event => {
      if (!stopped) setChoice(event.payload.analytics_consent);
    }).then(fn => { if (stopped) fn(); else disposeSettings=fn; }).catch(() => { if (!stopped) setError(true); });
    return () => { stopped=true; safeUnlisten(dispose); safeUnlisten(disposeSettings); };
  },[]);
  async function consent(granted: boolean) {
    setBusy(true); setError(false);
    try {
      const settings=await invoke<UsageSettings>('get_settings');
      const analytics_consent=granted ? 'granted' : 'denied';
      await invoke('save_settings',{settings:{...settings,analytics_consent}});
      setChoice(analytics_consent);
      void invoke('member_sync_usage').catch(()=>undefined);
    } catch { setError(true); } finally { setBusy(false); }
  }
  return <section className="mb-6 rounded-xl border border-slate-200 p-5">
    <h3 className="font-semibold">{en ? 'Member number' : '会員番号'}：{view?.generalNumber ?? (en ? 'Registration pending' : '登録待ち')}</h3>
    {view?.generalNumber && <button className="mt-2 text-sm underline" onClick={() => void navigator.clipboard.writeText(String(view.generalNumber)).catch(() => setError(true))}>{en ? 'Copy number' : '番号をコピー'}</button>}
    <h3 className="mt-4 font-semibold">{en ? 'Usage information' : '改善のための利用情報の送信'}</h3>
    <p className="mt-4 text-sm leading-6">{en ? 'Allow weekly feature counts and active-day counts to be sent to Google Analytics with a random analysis ID linked to this member number? The feature names used this week and approximate total app-open time are stored in Firestore under your member number. Note content, tag names, search terms and images are not sent.' : '機能ごとの週間使用回数と使用日数を、この会員番号と対応するランダムな分析IDでGoogle Analyticsへ送ってもよいですか？ 今週使った機能名とアプリを開いていた累計時間も、会員番号とともにFirestoreへ保存します。付箋本文・タグ名・検索語・画像は送りません。'}</p>
    <p className="mt-2 text-sm">{en ? 'This is the single setting you chose at startup. You can change it here. All features remain available if you decline.' : '初回に選んだ利用情報の送信設定を、ここで変更できます。送信しなくても全機能を使えます。'}</p>
    <p className="mt-2 text-sm">{en ? 'Current choice: ' : '現在の設定：'}{choice === 'granted' ? (en ? 'Enabled' : '協力する') : choice === 'denied' ? (en ? 'Disabled' : '送信しない') : (en ? 'Not selected' : '未選択')}</p>
    <div className="mt-3 flex gap-4">
      <button disabled={busy || !view} onClick={() => void consent(true)} className="rounded border px-3 py-2">{en ? 'Help improve' : '改善に協力する'}</button>
      <button disabled={busy || !view} onClick={() => void consent(false)} className="rounded border px-3 py-2">{en ? 'Do not send / stop' : '送信しない・停止する'}</button>
    </div>
    {error && <p role="status" className="mt-3 text-sm text-amber-800">{en ? 'Member data could not be read or synchronized. Please retry when online.' : '会員情報の読み込み、またはサーバーとの同期ができませんでした。通信可能な状態で再確認してください。'}</p>}
  </section>;
}
