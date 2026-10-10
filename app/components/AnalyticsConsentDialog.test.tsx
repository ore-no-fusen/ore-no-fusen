import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AnalyticsConsentDialog from './AnalyticsConsentDialog';

describe('AnalyticsConsentDialog', () => {
  afterEach(cleanup);
  it.each(['ja', 'en'] as const)('%s: 両方の選択を操作できる', (language) => {
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    render(<AnalyticsConsentDialog language={language} onAccept={onAccept} onDecline={onDecline} />);
    fireEvent.click(screen.getByText(language === 'en' ? 'What is sent' : '送信される項目を見る'));
    fireEvent.click(screen.getByRole('button', { name: language === 'en' ? 'Help improve (Recommended)' : '協力する（おすすめ）' }));
    fireEvent.click(screen.getByRole('button', { name: language === 'en' ? 'Do not send' : '送信しない' }));
    expect(onAccept).toHaveBeenCalledOnce();
    expect(onDecline).toHaveBeenCalledOnce();
  });
});
