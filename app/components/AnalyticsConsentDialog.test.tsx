import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AnalyticsConsentDialog from './AnalyticsConsentDialog';

describe('AnalyticsConsentDialog', () => {
  afterEach(cleanup);
  it.each(['ja', 'en'] as const)('%s: 3つの選択を操作できる', (language) => {
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    const onPostpone = vi.fn();
    render(<AnalyticsConsentDialog language={language} onAccept={onAccept} onDecline={onDecline} onPostpone={onPostpone} />);
    fireEvent.click(screen.getByText(language === 'en' ? 'What is sent' : '送信される項目を見る'));
    fireEvent.click(screen.getByRole('button', { name: language === 'en' ? 'Help improve' : '協力する' }));
    fireEvent.click(screen.getByRole('button', { name: language === 'en' ? 'Do not send' : '送信しない' }));
    fireEvent.click(screen.getByRole('button', { name: language === 'en' ? 'Decide later' : '今は決めない' }));
    expect(onAccept).toHaveBeenCalledOnce();
    expect(onDecline).toHaveBeenCalledOnce();
    expect(onPostpone).toHaveBeenCalledOnce();
  });
});
