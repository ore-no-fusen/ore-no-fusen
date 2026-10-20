'use client';

import React, { useEffect, useRef } from 'react';
import MessageSurface from './MessageSurface';
import type { Language } from '@/lib/i18n';

type Props = {
  language: Language;
  onAccept: () => void;
  onDecline: () => void;
  onPostpone: () => void;
  onPresented?: () => void;
  saveError?: boolean;
  busy?: boolean;
  isDeniedReconfirmation?: boolean;
  onReconfirmationPresented?: () => void;
};

export default function AnalyticsConsentDialog({ language, onAccept, onDecline, onPostpone, onPresented, saveError = false, busy = false, isDeniedReconfirmation = false, onReconfirmationPresented }: Props) {
  const en = language === 'en';
  const presentedRef = useRef(false);
  const reportedRef = useRef(false);
  useEffect(() => {
    if (reportedRef.current) return;
    reportedRef.current = true;
    onPresented?.();
  }, [onPresented]);
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
        {isDeniedReconfirmation ? (
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {en ? 'One quick check. No usage information is sent unless you choose to share.' : '今回だけ確認します。送信を選ぶまで、利用情報は送られません。'}
          </p>
        ) : <>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {en
            ? 'Usage information means things like which features you use and how long the app is open. It does not include the contents of your notes, images, tag names, search terms, file names, or other personal content.'
            : '利用情報とは、使った機能やアプリの起動時間などです。付箋の内容、画像、タグ名、検索語、ファイル名など、個人の内容は含まれません。'}
        </p>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {en
            ? 'Sharing helps us decide which features to improve. You can also send us a quick note about anything you notice. Improvements may make your daily notes and organizing easier.'
            : '送信に協力すると、どの機能を改善するとよいかを考える参考になります。気づいたことも、かんたんに送れます。改善が進めば、毎日のメモや整理がもっと使いやすくなるかもしれません。'}
        </p>
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
            {en ? 'What is sent' : '送信される項目を見る'}
          </summary>
          <p className="mt-2 leading-6">
            {en
              ? 'App start, first note creation/save, restore outcomes, app version, distribution type, language, and safe error categories go to Google Analytics 4. Weekly feature names, counts, active days, and last-used day use a random analysis ID there. The features used this week and approximate total app-open time are stored with your member number in Firestore. These are sent only after you choose to help.'
              : 'アプリ起動、初回の付箋作成・保存、復元結果、アプリ版、配布形式、言語、安全なエラー分類をGoogle Analytics 4へ送信します。週間の機能名・使用回数・使用日数・最終使用日はランダムな分析IDで送信します。今週使った機能と累計起動時間は会員番号とともにFirestoreへ保存します。協力を選ぶまでは送信しません。'}
          </p>
        </details>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          {en
            ? 'Sharing is optional. All features work if you do not share. Choose whether to send usage information.'
            : '送信は任意です。送らなくても全機能を使えます。送信するかどうかを選んでください。'}
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          {en
            ? 'If you choose “Decide later,” we will wait at least 7 days before asking again. You can change your choice in Settings → Developer Messages.'
            : '「今は決めない」を選ぶと、少なくとも7日間は再確認しません。送信設定は「設定 → 開発者とのやりとり」で変更できます。'}
        </p>
        </>}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
          <button disabled={busy} onClick={onAccept} className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50">
            {en ? 'Share usage information' : '送信に協力する'}
          </button>
          <button disabled={busy} onClick={onDecline} className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50">
            {en ? 'Do not send' : '送信しない'}
          </button>
          <button disabled={busy} onClick={onPostpone} className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50">
            {en ? 'Decide later' : '今は決めない'}
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">{en ? 'Your choice is recorded as a setting. Feature usage information is sent only if you agree.' : '選択内容は設定状況として記録します。協力を選ぶまで、機能の利用情報は送りません。'}</p>
        {saveError && <p role="alert" className="mt-2 text-sm text-red-700">{en ? 'Could not save your choice. Please try again.' : '選択を保存できませんでした。もう一度お試しください。'}</p>}
      </MessageSurface>
    </div>
  );
}
