import React, { useState } from 'react';
import { useAnalyticsConsentPromptPostponed, shouldShowAnalyticsConsentPrompt } from '../hooks/useAnalyticsConsentPrompt';
import { ANALYTICS_CONSENT_RECONFIRMATION_VERSION } from '../utils/analyticsConsentPrompt';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AnalyticsConsentDialog from './AnalyticsConsentDialog';

function ConsentFlowHarness({
  consent,
  version,
  saveConsent,
  eligible = true,
}: {
  consent?: 'granted' | 'denied';
  eligible?: boolean;
  version?: number;
  saveConsent: (choice: 'granted' | 'denied') => void;
}) {
  const [storedVersion, setStoredVersion] = useState(version);
  const { postponed, postpone, reconfirmationPresented, markReconfirmationPresented } = useAnalyticsConsentPromptPostponed();
  const showPrompt = shouldShowAnalyticsConsentPrompt({
    isMainWindow: true,
    isCheckingSetup: false,
    setupRequired: false,
    settingsLoading: false,
    consent,
    reconfirmationVersion: storedVersion,
    reconfirmationPresented,
    postponed,
    eligible,
  });
  if (!showPrompt) return <main>付箋画面</main>;
  const isDeniedReconfirmation = consent === 'denied';
  return (
    <AnalyticsConsentDialog
      language="ja"
      isDeniedReconfirmation={isDeniedReconfirmation}
      onReconfirmationPresented={() => {
        markReconfirmationPresented();
        setStoredVersion(ANALYTICS_CONSENT_RECONFIRMATION_VERSION);
      }}
      onAccept={() => saveConsent('granted')}
      onDecline={() => saveConsent('denied')}
      onPostpone={postpone}
    />
  );
}

describe('AnalyticsConsentDialog', () => {
  afterEach(cleanup);

  it('初回や保留期間中は案内条件を満たさず、通常の付箋画面へ進む', () => {
    render(<ConsentFlowHarness eligible={false} saveConsent={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('付箋画面')).toBeTruthy();
  });

  it.each(['ja', 'en'] as const)('%s: 初回画面で送信内容の説明と3つの選択を表示する', (language) => {
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    const onPostpone = vi.fn();
    render(<AnalyticsConsentDialog language={language} onAccept={onAccept} onDecline={onDecline} onPostpone={onPostpone} />);
    expect(screen.getByRole('heading', { name: language === 'en' ? 'About sharing usage information' : '利用情報の送信について' })).toBeTruthy();
    expect(screen.getByText(language === 'en' ? /Help us improve the app by sharing which features/ : /使った機能や起動時間を、アプリの改善の参考に/)).toBeTruthy();
    expect(screen.getByText(language === 'en' ? /Your note contents, images, tag names, search terms, and file names are not sent/ : /付箋の内容・画像・タグ名・検索語・ファイル名は送りません/)).toBeTruthy();
    expect(screen.getByText(language === 'en' ? /All features work if you do not share/ : /送信しなくても全機能を使えます/)).toBeTruthy();
    expect(screen.getByText(language === 'en' ? /one star for each week a report arrives/ : /週次報告が届いた週に★が1つ増えます/)).toBeTruthy();
    fireEvent.click(screen.getByText(language === 'en' ? 'Sharing details and stars' : '送信内容・感謝の★について'));
    fireEvent.click(screen.getByRole('button', { name: language === 'en' ? 'Share usage information' : '送信に協力する' }));
    fireEvent.click(screen.getByRole('button', { name: language === 'en' ? 'Do not send' : '送信しない' }));
    fireEvent.click(screen.getByRole('button', { name: language === 'en' ? 'Decide later' : '今は決めない' }));
    expect(onAccept).toHaveBeenCalledOnce();
    expect(onDecline).toHaveBeenCalledOnce();
    expect(onPostpone).toHaveBeenCalledOnce();
  });

  it('拒否中の再確認は短い説明で、表示されたリビジョンを記録する', () => {
    const onPresented = vi.fn();
    render(<AnalyticsConsentDialog language="ja" isDeniedReconfirmation onReconfirmationPresented={onPresented} onAccept={vi.fn()} onDecline={vi.fn()} onPostpone={vi.fn()} />);
    expect(screen.getByText('今回だけ確認します。送信を選ぶまで、利用情報は送られません。')).toBeTruthy();
    expect(screen.queryByText(/利用情報とは、使った機能/)).toBeNull();
    expect(screen.getByRole('button', { name: '送信に協力する' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '送信しない' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '今は決めない' })).toBeTruthy();
    expect(onPresented).toHaveBeenCalledOnce();
  });

  it('「今は決めない」は同意を変更せず、再案内条件を満たした起動で再表示する', () => {
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

  it('拒否者には一度だけ表示し、表示済みなら次回起動では再表示しない', () => {
    const saveConsent = vi.fn();
    const firstLaunch = render(<ConsentFlowHarness consent="denied" saveConsent={saveConsent} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('今回だけ確認します。送信を選ぶまで、利用情報は送られません。')).toBeTruthy();
    // 保存済みフラグの反映後も、現在の確認画面は閉じるまで表示され続ける。
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '今は決めない' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(saveConsent).not.toHaveBeenCalled();
    firstLaunch.unmount();
    render(<ConsentFlowHarness consent="denied" version={ANALYTICS_CONSENT_RECONFIRMATION_VERSION} saveConsent={saveConsent} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('付箋画面')).toBeTruthy();
  });

  it('送信許可済みの人には再確認を出さない', () => {
    render(<ConsentFlowHarness consent="granted" saveConsent={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('付箋画面')).toBeTruthy();
  });
});
