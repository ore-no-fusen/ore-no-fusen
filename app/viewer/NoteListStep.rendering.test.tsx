import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NoteListStep } from './NoteListStep';
import { hydrateEditor, serializeEditor } from './editor-helpers';
import { PWA_VERSION } from '@/lib/pwa-version.mjs';

describe('実際のPWA表示と保存', () => {
  it('一覧の受信本文を朱の太字にし、元のMarkdownを開く処理へ渡す', () => {
    const note = { id: 'received', title: 'PCから受信', body: '前 **強調** 後', status: 'received_pc' as const, created_at: '' };
    const onOpen = vi.fn();
    const { container, getByRole } = render(<NoteListStep notes={[note]} isLoading={false}
      thumbnailUrls={new Map()} lockedNoteIds={[]} isLockPermissionPending={false}
      t={key => key} language="ja" runtimeOrigin="https://example.com" runtimeKind="Vercel"
      onNew={vi.fn()} onOpen={onOpen} onDelete={vi.fn()} onLockToggle={vi.fn()}
      onReRegisterPush={vi.fn()} onLanguageChange={vi.fn()} />);
    expect(container.querySelector('strong')?.textContent).toBe('強調');
    expect(container.querySelector('strong')?.style.color).toBe('red');
    expect(container.textContent).toContain(`PWA ${PWA_VERSION}`);
    fireEvent.click(getByRole('listitem'));
    expect(onOpen).toHaveBeenCalledWith(note);
    expect(note.body).toBe('前 **強調** 後');
  });

  it('編集中の太字とチェック項目を表示し、保存時に強調記号を保持する', () => {
    const markdown = '前 **強調** 後\n- [ ] **確認項目**\n**https://example.com**';
    const editor = document.createElement('div');
    hydrateEditor(editor, markdown, new Map());
    expect(editor.querySelectorAll('strong')).toHaveLength(3);
    expect(editor.querySelector('strong')?.style.color).toBe('red');
    expect(editor.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
    expect(serializeEditor(editor)).toBe(markdown);
    editor.querySelector('input')!.checked = true;
    expect(serializeEditor(editor)).toContain('- [x] **確認項目**');
  });

  it('HTMLを実行せず、インラインコードとエスケープした記号を保存する', () => {
    const markdown = '**<img src=x onerror=alert(1)>**\n`**コード**`\n\\**記号**';
    const editor = document.createElement('div');
    hydrateEditor(editor, markdown, new Map());
    expect(editor.querySelectorAll('img')).toHaveLength(0);
    expect(editor.querySelectorAll('strong')).toHaveLength(1);
    expect(serializeEditor(editor)).toBe(markdown);
  });
});
