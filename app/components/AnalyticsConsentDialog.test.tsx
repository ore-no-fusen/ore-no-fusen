import React from 'react';
import { useAnalyticsConsentPromptPostponed, shouldShowAnalyticsConsentPrompt } from '../hooks/useAnalyticsConsentPrompt';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AnalyticsConsentDialog from './AnalyticsConsentDialog';

function ConsentFlowHarness({ consent, saveConsent }: { consent?: 'granted' | 'denied'; saveConsent: (choice: 'granted' | 'denied') => void }) {
  const { postponed, postpone } = useAnalyticsConsentPromptPostponed();
  const showPrompt = shouldShowAnalyticsConsentPrompt({
    isMainWindow: true,
    isCheckingSetup: false,
    setupRequired: false,
    settingsLoading: false,
    consent,
    postponed,
  });
  if (!showPrompt) return <main>付箋画面</main>;
  return <AnalyticsConsentDialog language="ja" onAccept={() => saveConsent('granted')} onDecline={() => saveConsent('denied')} onPostpone={postpone} />;
}

describe('AnalyticsConsentDialog', () => {
  afterEach(cleanup);
  it.each(['ja', 'en'] as const)('%s: 3つの選択を操作できる', (language) => {
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    const onPostpone = vi.fn();
    render(<AnalyticsConsentDialog language={language} onAccept={onAccept} onDecline={onDecline} onPostpone={onPostpone} />);
    expect(screen.getByRole('heading', { name: language === 'en' ? /grows with the people who use it/ : /使う人と一緒に育っていきます/ })).toBeTruthy();
    expect(screen.getByText(language === 'en' ? /Usage sharing is optional/ : /利用情報の送信は任意で/)).toBeTruthy();
    expect(screen.getByText(language === 'en' ? /every feature works either way/i : /送らなくても全機能を使えます/)).toBeTruthy();
    expect(screen.getByText(language === 'en' ? /Ranks rise at 1, 4, 12, 26, and 52 reporting weeks/ : /累計1・4・12・26・52週で称号が上がります/)).toBeTruthy();
    expect(screen.getByText(language === 'en' ? /A more useful app can make everyday life a little easier/ : /あなたの毎日も少しよくなる/)).toBeTruthy();
    expect(screen.getByText(language === 'en' ? /a small seed of thanks[\s\S]*suggestions help us make it better/ : /小さな「ありがとう」のたねです[\s\S]*助言を改善に活かし/)).toBeTruthy();
    expect(screen.queryByText(language === 'en' ? /Future rewards are being considered/ : /将来のごほうび/)).toBeNull();
    fireEvent.click(screen.getByText(language === 'en' ? 'What is sent' : '送信される項目を見る'));
    fireEvent.click(screen.getByRole('button', { name: language === 'en' ? 'Help improve' : '協力する' }));
    fireEvent.click(screen.getByRole('button', { name: language === 'en' ? 'Do not send' : '送信しない' }));
    fireEvent.click(screen.getByRole('button', { name: language === 'en' ? 'Decide later' : '今は決めない' }));
    expect(onAccept).toHaveBeenCalledOnce();
    expect(onDecline).toHaveBeenCalledOnce();
    expect(onPostpone).toHaveBeenCalledOnce();
  });

  it('保留では設定を保存せずアプリへ進み、同意未選択の新しい起動では再表示する', () => {
    const saveConsent = vi.fn();
    const firstLaunch = render(<ConsentFlowHarness saveConsent={saveConsent} />);

    fireEvent.click(screen.getByRole('button', { name: '今は決めない' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('付箋画面')).toBeTruthy();
    expect(saveConsent).not.toHaveBeenCalled();

    firstLaunch.unmount();
    render(<ConsentFlowHarness saveConsent={saveConsent} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it.each(['granted', 'denied'] as const)('%s は保留・再表示の状態にならない', (consent) => {
    render(<ConsentFlowHarness consent={consent} saveConsent={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('付箋画面')).toBeTruthy();
  });
});
