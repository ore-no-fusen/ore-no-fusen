'use client';

import type { Language } from '@/lib/i18n';

type Props = {
  language: Language;
  onAccept: () => void;
  onDecline: () => void;
};

export default function AnalyticsConsentDialog({ language, onAccept, onDecline }: Props) {
  const en = language === 'en';
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-7 shadow-2xl">
        <h2 className="text-xl font-bold text-slate-900">
          {en ? 'Help improve Ore No Fusen?' : '俺の付箋の改善に協力しますか？'}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {en
            ? 'Anonymous usage and error events help us improve startup, saving, and usability. Note content, images, file names, storage locations, and personal information are never sent.'
            : '匿名の利用状況とエラー情報を、起動・保存・操作性の改善に役立てます。付箋の内容、画像、ファイル名、保存場所、個人情報は送信しません。'}
        </p>
        <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <summary className="cursor-pointer font-semibold text-slate-800">
            {en ? 'What is sent' : '送信される項目を見る'}
          </summary>
          <p className="mt-2 leading-6">
            {en
              ? 'App start, first note creation/save, restore success or failure, app version, distribution type, language, and safe error category. Sent to Google Analytics 4 only after consent.'
              : 'アプリ起動、初回の付箋作成・保存、復元の成功・失敗、アプリ版、配布形式、言語、安全なエラー分類です。同意後だけGoogle Analytics 4へ送信します。'}
          </p>
        </details>
        <p className="mt-4 text-xs leading-5 text-slate-500">
          {en
            ? 'Declining does not disable any feature. You can change this later in Settings.'
            : '送信しなくても、すべての機能を利用できます。後から設定画面で変更できます。'}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
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
