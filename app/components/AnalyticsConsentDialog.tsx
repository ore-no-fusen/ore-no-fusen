'use client';

import React from 'react';
import type { Language } from '@/lib/i18n';

type Props = {
  language: Language;
  onAccept: () => void;
  onDecline: () => void;
};

export default function AnalyticsConsentDialog({ language, onAccept, onDecline }: Props) {
  const en = language === 'en';
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-2 sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="analytics-consent-title" tabIndex={0} className="w-full min-w-0 max-w-lg max-h-[90vh] overflow-y-auto break-words rounded-2xl bg-white p-4 sm:p-7 shadow-2xl">
        <h2 id="analytics-consent-title" className="text-xl font-bold text-slate-900">
          {en ? 'Help improve Ore No Fusen?' : '俺の付箋の改善に協力しますか？'}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {en
            ? 'Usage and error events help us improve startup, saving, and usability. This choice also includes member feature usage analysis. Note content, images, file names, and storage locations are never sent.'
            : '利用状況とエラー情報を、起動・保存・操作性の改善に役立てます。この選択には会員別の機能利用分析も含まれます。付箋の内容、画像、ファイル名、保存場所は送信しません。'}
        </p>
        <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <summary className="cursor-pointer font-semibold text-slate-800">
            {en ? 'What is sent' : '送信される項目を見る'}
          </summary>
          <p className="mt-2 leading-6">
            {en
              ? 'App start, first note creation/save, restore success or failure, app version, distribution type, language, and safe error category are sent to Google Analytics 4. Weekly feature counts and active-day counts use a random analysis ID. Features used this week and total app-open time are stored with your member number in Firestore. Data is sent only if you agree.'
              : 'アプリ起動、初回の付箋作成・保存、復元の成功・失敗、アプリ版、配布形式、言語、安全なエラー分類をGoogle Analytics 4へ送信します。機能ごとの週間使用回数・使用日数もランダムな分析IDで送信します。今週使った機能と累計起動時間は、会員番号とともにFirestoreへ保存します。協力を選んだ場合だけ送信します。'}
          </p>
        </details>
        <p className="mt-4 text-xs leading-5 text-slate-500">
          {en
            ? 'Declining does not disable any feature. You can change this later in Settings → Developer Messages.'
            : '送信しなくても、すべての機能を利用できます。後から「設定 → 開発者とのやりとり」で変更できます。'}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
          <button onClick={onDecline} className="rounded-lg bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200">
            {en ? 'Do not send' : '送信しない'}
          </button>
          <button onClick={onAccept} className="rounded-lg bg-[#5C7A3E] px-5 py-3 text-sm font-bold text-white shadow hover:bg-[#4A6730]">
            {en ? 'Help improve (Recommended)' : '協力する（おすすめ）'}
          </button>
        </div>
      </div>
    </div>
  );
}
