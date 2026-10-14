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
    expect(screen.getByRole('heading', { name: language === 'en' ? 'About sharing usage information' : '利用情報の送信について' })).toBeTruthy();
    expect(screen.getByText(language === 'en' ? /Usage information means things like which features you use and how long the app is open/ : /利用情報とは、使った機能やアプリの起動時間などです/)).toBeTruthy();
    expect(screen.getByText(language === 'en' ? /does not include the contents of your notes, images, tag names, search terms, file names, or other personal content/ : /付箋の内容、画像、タグ名、検索語、ファイル名など、個人の内容は含まれません/)).toBeTruthy();
    expect(screen.getByText(language === 'en' ? /Sharing helps us decide which features to improve/ : /どの機能を改善するとよいかを考える参考になります/)).toBeTruthy();
    expect(screen.getByText(language === 'en' ? /Improvements may make your daily notes and organizing easier/ : /毎日のメモや整理がもっと使いやすくなるかもしれません/)).toBeTruthy();
    expect(screen.getByText(language === 'en' ? /All features work if you do not share/ : /送信は任意です。送らなくても全機能を使えます/)).toBeTruthy();
    expect(screen.getByText(language === 'en' ? /one star for each week a report arrives/ : /週次報告が届いた週に★が1つ増えます/)).toBeTruthy();
    fireEvent.click(screen.getByText(language === 'en' ? 'What is sent' : '送信される項目を見る'));
    fireEvent.click(screen.getByRole('button', { name: language === 'en' ? 'Share usage information' : '送信に協力する' }));
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
