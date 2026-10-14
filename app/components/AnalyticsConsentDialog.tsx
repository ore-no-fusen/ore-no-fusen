'use client';

import React from 'react';
import MessageSurface from './MessageSurface';
import type { Language } from '@/lib/i18n';

type Props = {
  language: Language;
  onAccept: () => void;
  onDecline: () => void;
  onPostpone: () => void;
};

export default function AnalyticsConsentDialog({ language, onAccept, onDecline, onPostpone }: Props) {
  const en = language === 'en';
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-2 sm:p-4">
      <MessageSurface role="dialog" aria-modal="true" aria-labelledby="analytics-consent-title" tabIndex={0} style={{ maxWidth: '32rem' }} className="w-full min-w-0 max-w-lg max-h-[90vh] overflow-y-auto break-words rounded-2xl bg-white p-4 sm:p-7 shadow-2xl">
        <h2 id="analytics-consent-title" className="text-xl font-bold text-slate-900">
          {en ? 'Let’s support each other and grow Ore-no-Fusen together.' : '応援し合って、俺の付箋を一緒に育てる。'}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {en
            ? 'Your optional support helps the developer decide what to improve. In return, the developer will share progress and changes through Developer Messages. Usage sharing is your choice, and every feature works either way. Note text, images, tag names, search terms, file names, and storage locations are never sent.'
            : 'あなたの応援を、次に直すところを考える力にします。こちらからも、改善の進み具合や変えたことを「開発者からのお便り」でお返しします。利用情報を送るかはあなたが選べて、送らなくても全機能を使えます。付箋の本文・画像・タグ名・検索語・ファイル名・保存場所は送りません。'}
        </p>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <p className="font-bold">{en ? '★ Become an improvement partner' : '★ 改善パートナーとして星をためる'}</p>
          <p className="mt-1">
            {en
              ? 'When a consented weekly report reaches the server, you earn one star for that week. Your title ranks up at 1, 4, 12, 26, and 52 total reporting weeks. Feature usage counts do not affect your stars, and earned stars remain if you later stop sharing. We hope to offer thank-you rewards in the future; details and timing are still being planned.'
              : '同意した週の利用報告がサーバーに届くと、その週に★を1つ獲得できます。累計1・4・12・26・52週で称号がランクアップします。機能を使った回数では増減せず、送信を後から停止しても獲得済みの★は残ります。いつか協力してよかったと思えるごほうびを用意したいと考えています。内容と時期はこれから準備します。'}
          </p>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-600">{en ? 'Your support helps the app improve; the developer will return that support by sharing progress and changes through Developer Messages.' : 'あなたの応援を改善につなげ、こちらからも進み具合や変えたことを「開発者からのお便り」で返す。これが応援し合って育てる仕組みです。'}</p>
        <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <summary className="cursor-pointer font-semibold text-slate-800">
            {en ? 'What is sent' : '送信される項目を見る'}
          </summary>
          <p className="mt-2 leading-6">
            {en
              ? 'App start, first note creation/save, restore outcomes, app version, distribution type, language, and safe error categories go to Google Analytics 4. Weekly feature names, counts, active days, and last-used day use a random analysis ID there. The features used this week and approximate total app-open time are stored with your member number in Firestore. These are sent only after you choose to help.'
              : 'アプリ起動、初回の付箋作成・保存、復元結果、アプリ版、配布形式、言語、安全なエラー分類をGoogle Analytics 4へ送信します。週間の機能名・使用回数・使用日数・最終使用日はランダムな分析IDで送信します。今週使った機能と累計起動時間は会員番号とともにFirestoreへ保存します。協力を選ぶまでは送信しません。'}
          </p>
        </details>
        <p className="mt-4 text-xs leading-5 text-slate-500">
          {en
            ? 'All features work whichever option you choose. You can change your choice later in Settings → Developer Messages. If you choose “Decide later,” this question appears again the next time you start the app.'
            : 'どれを選んでも全機能を利用できます。後から「設定 → 開発者とのやりとり」で変更できます。「今は決めない」を選ぶと、次回起動時にもう一度確認します。'}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
          <button onClick={onAccept} className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {en ? 'Help improve' : '協力する'}
          </button>
          <button onClick={onDecline} className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {en ? 'Do not send' : '送信しない'}
          </button>
          <button onClick={onPostpone} className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {en ? 'Decide later' : '今は決めない'}
          </button>
        </div>
      </MessageSurface>
    </div>
  );
}
