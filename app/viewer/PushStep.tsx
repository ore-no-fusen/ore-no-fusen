'use client';

import React, { useState } from 'react';
import { subscribePush } from './lib/push';
import type { TranslationKey } from '@/lib/i18n';

// ---------------------------------------------------------------------------
// PushStep: Push通知セットアップ画面（step === 'push'）
// ---------------------------------------------------------------------------

type PushStepProps = {
  swReady: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  accessToken: string | null;
  t: (key: TranslationKey) => string;
  setIsLoading: (v: boolean) => void;
  setErrorMessage: (msg: string | null) => void;
  setStep: (step: 'login' | 'write') => void;
};

/**
 * 責務: Push 通知許可セットアップ画面を描画する
 * 入力: PushStepProps（swReady, isLoading, errorMessage, accessToken, t, 各 callback）
 * 出力: JSX.Element
 * 副作用: なし（subscribePush の呼び出しは onClick ハンドラ経由）
 */
export function PushStep({
  swReady,
  isLoading,
  errorMessage,
  accessToken,
  t,
  setIsLoading,
  setErrorMessage,
  setStep,
}: PushStepProps) {
  // 現在の処理段階（subscribePush から逐次更新される）
  const [progress, setProgress] = useState<string | null>(null);

  const startSubscribe = () => {
    if (!accessToken) return;
    setErrorMessage(null);
    setProgress(null);
    subscribePush({
      accessToken,
      setIsLoading,
      setErrorMessage,
      setStep,
      setProgress,
    });
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md mx-auto px-4">
      <p className="text-gray-700">{t('pwa.setup.step')}</p>
      {!swReady ? (
        <p className="text-gray-500 text-sm">{t('pwa.setup.swPreparing')}</p>
      ) : (
        <button
          className="bg-blue-600 text-white rounded-lg px-6 py-3 font-medium disabled:opacity-50"
          disabled={isLoading}
          onClick={startSubscribe}
        >
          {isLoading ? t('pwa.saving') : (errorMessage ? t('pwa.setup.tryAgain') : t('pwa.setup.enableNotifications'))}
        </button>
      )}

      {/* 進捗表示（処理中だけ表示） */}
      {isLoading && progress && (
        <div className="w-full rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
          {progress}
        </div>
      )}

      {/* エラー表示（自己解決のヒント付き） */}
      {errorMessage && (
        <div className="w-full rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 space-y-2">
          <p className="font-semibold">{t('pwa.setup.failed')}</p>
          <p className="text-xs whitespace-pre-wrap break-words">{errorMessage}</p>
          <details className="text-xs">
            <summary className="cursor-pointer text-red-700 font-medium">{t('pwa.setup.help')}</summary>
            <ol className="mt-2 ml-4 list-decimal space-y-1 text-red-700">
              <li>{t('pwa.setup.hint1')}</li>
              <li>{t('pwa.setup.hint2')}</li>
              <li>{t('pwa.setup.hint3')}</li>
              <li>{t('pwa.setup.hint4')}</li>
            </ol>
          </details>
        </div>
      )}
    </div>
  );
}
