import { render, screen } from '@testing-library/react';
import { vi, it, expect } from 'vitest';
import React from 'react';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams({
    title: 'お知らせ',
    body: '**大切**\n[案内](https://example.com/help) [危険](javascript:alert(1)) <img src=x onerror=alert(1)>',
    createdAt: '2026-09-24T00:00:00Z',
  }),
}));

import AnnouncementPage from './page';

it('お便りの書式を表示し、HTMLと危険なリンクを実行可能な要素にしない', () => {
  const { container } = render(<AnnouncementPage />);
  expect(screen.getByRole('heading', { name: 'お知らせ' })).toBeTruthy();
  expect(screen.getByText('大切').tagName).toBe('STRONG');
  expect(screen.getByRole('link', { name: '案内' }).getAttribute('href')).toBe('https://example.com/help');
  expect(screen.queryByRole('link', { name: '危険' })).toBeNull();
  expect(container.querySelector('img')).toBeNull();
  expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
});
