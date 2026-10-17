'use client';

import React, { useEffect, useRef } from 'react';
import MessageSurface from './MessageSurface';
import type { Language } from '@/lib/i18n';

type Props = {
  language: Language;
  onAccept: () => void;
  onDecline: () => void;
  onPostpone: () => void;
  isDeniedReconfirmation?: boolean;
  onReconfirmationPresented?: () => void;
};

export default function AnalyticsConsentDialog({ language, onAccept, onDecline, onPostpone, isDeniedReconfirmation = false, onReconfirmationPresented }: Props) {
  const en = language === 'en';
  const presentedRef = useRef(false);
  useEffect(() => {
    if (!isDeniedReconfirmation || presentedRef.current) return;
    presentedRef.current = true;
    onReconfirmationPresented?.();
  }, [isDeniedReconfirmation, onReconfirmationPresented]);

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-2 sm:p-4">
      <MessageSurface role="dialog" aria-modal="true" aria-labelledby="analytics-consent-title" tabIndex={0} style={{ maxWidth: '32rem' }} className="w-full min-w-0 max-w-lg max-h-[90vh] overflow-y-auto break-words rounded-2xl bg-white p-4 sm:p-7 shadow-2xl">
        <h2 id="analytics-consent-title" className="text-xl font-bold text-slate-900">
          {en ? 'About sharing usage information' : '利用情報の送信について'}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {isDeniedReconfirmation
            ? (en ? 'We have shortened the explanation. Nothing is sent unless you choose to share.' : '説明を短く整理しました。送信を選ぶまで、利用情報は送られません。')
            : (en ? 'Usage sharing is optional. All features work if you do not share.' : '利用情報の送信は任意です。送らなくても全機能を使えます。')}
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          {en ? 'We ask after you have used and saved a note. If you decide later, we wait seven days before asking again.' : '付箋を使って保存した後に確認します。「今は決めない」の場合、7日間は再表示しません。'}
        </p>
        <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          <p><strong>{en ? 'Sent:' : '送るもの：'}</strong> {en ? 'Features used, approximate app-open time, days used, app version, and anonymous random identifiers.' : '使った機能、おおよそのアプリ利用時間、使用日、アプリバージョン、分析用の匿名・ランダム識別情報。'}</p>
          <p><strong>{en ? 'Not sent:' : '送らないもの：'}</strong> {en ? 'Note text, tag names, search terms, images or attachments, file names, and file paths.' : '付箋本文、タグ名、検索語、画像・添付内容、ファイル名、ファイルパス。'}</p>
          <p><strong>{en ? 'Purpose:' : '目的：'}</strong> {en ? 'Understand which features are used and choose improvement priorities together.' : '使われている機能を知り、改善する機能の優先順位を一緒に考えます。'}</p>
        </div>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <p className="font-bold">{en ? '★ Thank you for using Ore-no-Fusen' : '★ 使ってくれて、ありがとう'}</p>
          <p className="mt-1">
            {en
              ? 'If you choose to share, you receive one star for each week a report arrives (up to one per week). Earned stars remain if you stop sharing.'
              : '利用情報の送信を選んだ方は、週次報告が届いた週に★が1つ増えます（週1つまで）。送信を停止しても、獲得済みの★は残ります。'}
          </p>
        </div>
        <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <summary className="cursor-pointer font-semibold text-slate-800">
            {en ? 'Details about data and storage' : '送信内容と保存先を詳しく見る'}
          </summary>
          <p className="mt-2 leading-6">
            {en
              ? 'GA4 receives app start, first note creation/save, restore outcomes, app version, distribution type, language, and safe error categories. Weekly feature names, counts, active days, and last-used day use a random analysis ID. Firestore stores this week’s feature names and approximate total app-open time with your member number. No note content or file location is sent.'
              : 'Google Analytics 4には、アプリ起動、初回の付箋作成・保存、復元結果、アプリ版、配布形式、言語、安全なエラー分類を送ります。週間の機能名・使用回数・使用日数・最終使用日はランダムな分析IDで送ります。今週使った機能と累計起動時間は会員番号とともにFirestoreへ保存します。付箋の内容やファイルの場所は送りません。'}
          </p>
        </details>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          {en ? 'You can change your choice anytime in Settings → Developer Messages.' : '設定からいつでも変更できます（設定 → 開発者とのやりとり）。'}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
          <button onClick={onAccept} className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {en ? 'Share usage information' : '送信に協力する'}
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
