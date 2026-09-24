import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import React from 'react';
import AnnouncementCard, { announcementReplyDraft } from './AnnouncementCard';

it('本文を読める配色で表示し、危険なHTMLやリンクを実行せず返信できる', () => {
  const onReply = vi.fn();
  const { container } = render(<AnnouncementCard announcement={{
    id: 'mail-1', title: 'テスト投稿', body: 'やー\n**大切** [案内](https://example.com) <img src=x onerror=alert(1)>', createdAt: '2026-09-25T00:00:00Z',
  }} onReply={onReply} />);
  expect(screen.getByText('やー', { exact: false })).toBeTruthy();
  expect(container.querySelector('article')?.className).toContain('bg-white');
  expect(container.querySelector('article')?.className).toContain('text-slate-900');
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByRole('link', { name: '案内' }).getAttribute('href')).toBe('https://example.com/');
  fireEvent.click(screen.getByRole('button', { name: 'このお便りに返信' }));
  expect(onReply).toHaveBeenCalledOnce();
  expect(announcementReplyDraft({ id: 'mail-1', title: 'テスト投稿', body: 'やー', createdAt: '2026-09-25T00:00:00Z' }))
    .toContain('テスト投稿」（ID: mail-1）への返信:');
});
