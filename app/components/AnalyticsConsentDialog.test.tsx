import React, { useState } from 'react';
import { useAnalyticsConsentPromptPostponed, shouldShowAnalyticsConsentPrompt } from '../hooks/useAnalyticsConsentPrompt';
import { ANALYTICS_CONSENT_RECONFIRMATION_VERSION } from '../utils/analyticsConsentPrompt';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AnalyticsConsentDialog from './AnalyticsConsentDialog';
import { ANALYTICS_CONSENT_VALUE_COOLDOWN_MS } from '../utils/analyticsConsentPrompt';

function ConsentFlowHarness({
  consent,
  version,
  saveConsent,
  hasExperiencedValue = true,
}: {
  consent?: 'granted' | 'denied';
  version?: number;
  saveConsent: (choice: 'granted' | 'denied') => void;
  hasExperiencedValue?: boolean;
}) {
  const [storedVersion, setStoredVersion] = useState(version);
  const { postponed, postpone, reconfirmationPresented, markReconfirmationPresented, valueExperiencedAt, deferredUntil, now } = useAnalyticsConsentPromptPostponed(true);
  const showPrompt = shouldShowAnalyticsConsentPrompt({
    isMainWindow: true,
    isCheckingSetup: false,
    setupRequired: false,
    settingsLoading: false,
    consent,
    reconfirmationVersion: storedVersion,
    reconfirmationPresented,
    postponed,
    valueExperiencedAt: hasExperiencedValue && valueExperiencedAt === null
      ? Date.now() - ANALYTICS_CONSENT_VALUE_COOLDOWN_MS - 1000
      : valueExperiencedAt,
    deferredUntil,
    now,
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
  afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers(); });

  it.each(['ja', 'en'] as const)('%s: 初回画面で送信内容の説明と3つの選択を表示する', (language) => {
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    const onPostpone = vi.fn();
    render(<AnalyticsConsentDialog language={language} onAccept={onAccept} onDecline={onDecline} onPostpone={onPostpone} />);
    expect(screen.getByRole('heading', { name: language === 'en' ? 'About sharing usage information' : '利用情報の送信について' })).toBeTruthy();
    expect(screen.getByText(language === 'en' ? /Features used, approximate app-open time, days used, app version, and anonymous random identifiers/ : /使った機能、おおよそのアプリ利用時間、使用日、アプリバージョン、分析用の匿名・ランダム識別情報/)).toBeTruthy();
    expect(screen.getByText(language === 'en' ? /Note text, tag names, search terms, images or attachments, file names, and file paths/ : /付箋本文、タグ名、検索語、画像・添付内容、ファイル名、ファイルパス/)).toBeTruthy();
    expect(screen.getByText(language === 'en' ? /choose improvement priorities together/ : /改善する機能の優先順位を一緒に考えます/)).toBeTruthy();
    expect(screen.getByText(language === 'en' ? /All features work if you do not share/ : /利用情報の送信は任意です。送らなくても全機能を使えます/)).toBeTruthy();
    expect(screen.getByText(language === 'en' ? /change your choice anytime in Settings/ : /設定からいつでも変更できます/)).toBeTruthy();
    expect(screen.getByText(language === 'en' ? /one star for each week a report arrives/ : /週次報告が届いた週に★が1つ増えます/)).toBeTruthy();
    fireEvent.click(screen.getByText(language === 'en' ? 'Details about data and storage' : '送信内容と保存先を詳しく見る'));
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
    expect(screen.getByText('説明を短く整理しました。送信を選ぶまで、利用情報は送られません。')).toBeTruthy();
    expect(screen.getByText(/使った機能、おおよそのアプリ利用時間/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '送信に協力する' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '送信しない' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '今は決めない' })).toBeTruthy();
    expect(onPresented).toHaveBeenCalledOnce();
  });

  it('「今は決めない」は未選択のまま7日間再表示せず、期限後に再提示する', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
    const saveConsent = vi.fn();
    const firstLaunch = render(<ConsentFlowHarness saveConsent={saveConsent} />);
    fireEvent.click(screen.getByRole('button', { name: '今は決めない' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('付箋画面')).toBeTruthy();
    expect(saveConsent).not.toHaveBeenCalled();
    firstLaunch.unmount();
    render(<ConsentFlowHarness saveConsent={saveConsent} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => { vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000); });
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('拒否者には一度だけ表示し、表示済みなら次回起動では再表示しない', () => {
    const saveConsent = vi.fn();
    const firstLaunch = render(<ConsentFlowHarness consent="denied" saveConsent={saveConsent} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('説明を短く整理しました。送信を選ぶまで、利用情報は送られません。')).toBeTruthy();
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

  it('ユーザーが保存するまでは初回提示せず、保存後24時間は保留する', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
    localStorage.clear();
    const saveConsent = vi.fn();
    const first = render(<ConsentFlowHarness hasExperiencedValue={false} saveConsent={saveConsent} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => window.dispatchEvent(new Event('fusen:analytics_consent_value_experienced')));
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => { vi.advanceTimersByTime(24 * 60 * 60 * 1000); });
    expect(screen.getByRole('dialog')).toBeTruthy();
    first.unmount();
    vi.useRealTimers();
  });
});
