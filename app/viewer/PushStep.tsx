'use client';

import React from 'react';
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
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-gray-700">セットアップ ステップ 2 / 2</p>
      {!swReady ? (
        <p className="text-gray-500 text-sm">SW準備中...</p>
      ) : (
        <button
          className="bg-blue-600 text-white rounded-lg px-6 py-3 font-medium disabled:opacity-50"
          disabled={isLoading}
          onClick={() => {
            if (!accessToken) return;
            subscribePush({ accessToken, setIsLoading, setErrorMessage, setStep });
          }}
        >
          {isLoading ? t('pwa.saving') : '通知を許可する'}
        </button>
      )}
      {errorMessage && (
        <p className="text-red-600 text-sm">{errorMessage}</p>
      )}
    </div>
  );
}
