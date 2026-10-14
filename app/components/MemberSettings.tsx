'use client';

import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { safeUnlisten } from '../utils/safeUnlisten';

type MemberView = { generalNumber: number | null; analyticsSubject: string | null; environment: string; partnerStars?: number };
type UsageSettings = { analytics_consent?: 'granted' | 'denied'; [key: string]: unknown };
const PARTNER_RANKS = [
  { min: 1, stars: 1, ja: '改善パートナー', en: 'Improvement Partner' },
  { min: 4, stars: 2, ja: '継続パートナー', en: 'Continuing Partner' },
  { min: 12, stars: 3, ja: '改善アンバサダー', en: 'Improvement Ambassador' },
  { min: 26, stars: 4, ja: '特別改善パートナー', en: 'Special Improvement Partner' },
  { min: 52, stars: 5, ja: '永続改善パートナー', en: 'Lifetime Improvement Partner' },
];
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
  const partnerStars = Number.isSafeInteger(view?.partnerStars) && (view?.partnerStars ?? -1) >= 0 ? view!.partnerStars! : 0;
  const currentRank = [...PARTNER_RANKS].reverse().find(rank => partnerStars >= rank.min);
  const nextRank = PARTNER_RANKS.find(rank => partnerStars < rank.min);
  return <section className="mb-6 rounded-xl border border-slate-200 p-5">
    <p className="font-semibold">{en ? 'Ore-no-Fusen grows with the people who use it.' : '俺の付箋は、使う人と一緒に育っていきます。'}</p>
    <p className="mt-1 text-sm text-slate-600">{en ? 'Your suggestions and consented usage reports can guide improvements. A more useful app can make everyday life a little easier. Usage sharing is optional.' : '届いた助言や、同意を選んだ方の利用報告を改善に活かします。俺の付箋が使いやすくなれば、あなたの毎日も少しよくなる。利用情報の送信は任意です。'}</p>
    <h3 className="font-semibold">{en ? 'Member number' : '会員番号'}：{view?.generalNumber ?? (en ? 'Registration pending' : '登録待ち')}　<span className="text-amber-700" aria-label={en ? `${partnerStars} stars` : `星ポイント ${partnerStars} 個`}>★ × {partnerStars}</span></h3>
    <p className="mt-1 text-sm font-semibold text-amber-800" aria-label={en ? 'Improvement partner rank' : '改善パートナー称号'}>{en ? 'Rank: ' : '称号：'}{currentRank ? `${en ? currentRank.en : currentRank.ja} ${'★'.repeat(currentRank.stars)}` : (en ? 'Not earned yet' : 'これから獲得')}</p>
    <p className="mt-1 text-sm text-slate-600">{nextRank ? (en ? `${nextRank.min - partnerStars} more weekly report${nextRank.min - partnerStars === 1 ? '' : 's'} to ${nextRank.en}.` : `次の「${nextRank.ja}」まであと${nextRank.min - partnerStars}★です。`) : (en ? 'Highest rank reached.' : '最高ランクです。')}</p>
    <p className="mt-2 text-sm text-slate-600">{en ? 'You earn one star for each week a consented usage report reaches the server, up to one per week. Feature usage counts do not affect your stars. Earned stars remain if you stop sharing.' : '同意した利用報告がサーバーに届いた週に、★を1つ（週1つまで）ためられます。機能を使った回数では増減しません。送信を停止しても、獲得済みの★は残ります。'}</p>
    <p className="mt-1 text-sm text-slate-600">{en ? 'Stars are a small seed of thanks for using Ore-no-Fusen. Your suggestions help us make it better, so it can become an app that brings a little more ease to everyday life. We are grateful to everyone who helps it grow.' : '★は、俺の付箋を使ってくれることへの、小さな「ありがとう」のたねです。いただいた助言を改善に活かし、毎日が少し便利になるアプリに育てていきます。一緒に育ててくれる皆さんに感謝しています。'}</p>
    {view?.generalNumber && <button className="mt-2 text-sm underline" onClick={() => void navigator.clipboard.writeText(String(view.generalNumber)).catch(() => setError(true))}>{en ? 'Copy number' : '番号をコピー'}</button>}
    <h3 className="mt-4 font-semibold">{en ? 'Usage information' : '改善のための利用情報の送信'}</h3>
    <p className="mt-4 text-sm leading-6">{en ? 'We use consented usage information to find what to improve together. Weekly feature and active-day counts go to Google Analytics with a random analysis ID linked to this member number. This week’s feature names and approximate app-open time are stored in Firestore under your member number. Note content, tag names, search terms and images are not sent.' : '同意いただいた利用情報を、使う人と一緒に改善点を見つけるために使います。機能ごとの週間使用回数と使用日数は、この会員番号と対応するランダムな分析IDでGoogle Analyticsへ送ります。今週使った機能名と累計起動時間は会員番号とともにFirestoreへ保存します。付箋本文・タグ名・検索語・画像は送りません。'}</p>
    <p className="mt-2 text-sm">{en ? 'This is the single setting you chose at startup. You can change it here. All features remain available if you decline.' : '初回に選んだ利用情報の送信設定を、ここで変更できます。送信しなくても全機能を使えます。'}</p>
    <p className="mt-2 text-sm">{en ? 'Current choice: ' : '現在の設定：'}{choice === 'granted' ? (en ? 'Enabled' : '協力する') : choice === 'denied' ? (en ? 'Disabled' : '送信しない') : (en ? 'Not selected' : '未選択')}</p>
    <div className="mt-3 flex gap-4">
      <button disabled={busy || !view} onClick={() => void consent(true)} className="rounded border px-3 py-2">{en ? 'Help improve' : '改善に協力する'}</button>
      <button disabled={busy || !view} onClick={() => void consent(false)} className="rounded border px-3 py-2">{en ? 'Do not send / stop' : '送信しない・停止する'}</button>
    </div>
    {error && <p role="status" className="mt-3 text-sm text-amber-800">{en ? 'Member data could not be read or synchronized. Please retry when online.' : '会員情報の読み込み、またはサーバーとの同期ができませんでした。通信可能な状態で再確認してください。'}</p>}
  </section>;
}
