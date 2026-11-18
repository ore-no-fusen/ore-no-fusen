import React from 'react';
import { cleanup, render, waitFor, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import RichTextEditor from './RichTextEditor';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(null), convertFileSrc: (s: string) => s }));
vi.stubGlobal('React', React);
afterEach(cleanup);

describe('製品エディタの最初の入力通知', () => {
  it('選択変更では通知せず、空からの入力だけ通知し、続く文字では再通知しない', async () => {
    const onFirstChar = vi.fn();
    const { container } = render(<RichTextEditor value="" onChange={vi.fn()} filePath="" backgroundColor="#fff" onFirstChar={onFirstChar} />);
    await waitFor(() => expect(container.querySelector('.cm-content')).toBeTruthy());
    const view = EditorView.findFromDOM(container.querySelector('.cm-content') as HTMLElement)!;
    await act(async () => { view.dispatch({ selection: { anchor: 0 } }); });
    expect(onFirstChar).not.toHaveBeenCalled();
    await act(async () => { view.dispatch({ changes: { from: 0, insert: 'あ' } }); });
    expect(onFirstChar).toHaveBeenCalledTimes(1);
    await act(async () => { view.dispatch({ changes: { from: 1, insert: 'い' } }); });
    expect(onFirstChar).toHaveBeenCalledTimes(1);
  });
});
