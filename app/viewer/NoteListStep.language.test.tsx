import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NoteListStep } from './NoteListStep';

describe('NoteListStep language button', () => {
  it('requests English when the current PWA language is Japanese', () => {
    const onLanguageChange = vi.fn();
    const t = ((key: string) => key) as React.ComponentProps<typeof NoteListStep>['t'];

    render(
      <NoteListStep
        notes={[]}
        isLoading={false}
        thumbnailUrls={new Map()}
        lockedNoteIds={[]}
        isLockPermissionPending={false}
        t={t}
        language="ja"
        swVersion="test"
        runtimeOrigin="https://example.com"
        runtimeKind="Vercel"
        onNew={vi.fn()}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
        onLockToggle={vi.fn()}
        onReRegisterPush={vi.fn()}
        onLanguageChange={onLanguageChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'pwa.language.switch' }));
    expect(onLanguageChange).toHaveBeenCalledWith('en');
  });
});
